use std::{collections::HashMap, path::{Path, PathBuf}, sync::Arc};
use crate::{types::{ApiError, ApiResponse, ExportTaskRequest, ExportTaskResponse, ExportTaskStatus, FeishuFile, FeishuFilesPagination, FeishuRootMeta, FeishuWikiNode, FeishuWikiNodesPagination, FeishuWikiSpace, FeishuWikiSpacesPagination, FileInfo, TokenInfo, UserInfo}};
use reqwest::{Client, RequestBuilder, Response, StatusCode};
use futures_util::StreamExt;
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;


pub const FEISHU_ENDPOINT: &str = "https://open.feishu.cn/open-apis";
pub struct FeishuApi{
    http_client: Client,
    app_id: String,
    app_secret: String,
    redirect_uri: String,
    endpoint: String,
    save_path: PathBuf,
    access_token: Arc<Mutex<Option<String>>>,
    refresh_token: Arc<Mutex<Option<String>>>,
    on_loing_expire:  Option<Box<dyn Fn(String) + Send + Sync>>,
}

impl FeishuApi{
    fn read_token(save_path: &Path) -> (Option<String>, Option<String>) {
        let token_path = save_path.join("token.json");
        if let Ok(token_str) = std::fs::read_to_string(&token_path) {
            if let Ok(token_info) = serde_json::from_str::<TokenInfo>(&token_str) {
                return (Some(token_info.access_token), Some(token_info.refresh_token));
            }
        }
        (None, None)
    }
    pub fn new(app_id: String, app_secret: String, redirect_uri: String, save_path: PathBuf, on_loing_expire:  Option<Box<dyn Fn(String) + Send + Sync>>) -> Self{
        let (access_token, refresh_token) = Self::read_token(&save_path);
        Self{
            http_client: Client::new(),
            app_id: app_id,
            app_secret: app_secret,
            redirect_uri: redirect_uri,
            endpoint: FEISHU_ENDPOINT.to_string(),
            save_path: save_path,
            access_token: Arc::new(Mutex::new(access_token)),
            refresh_token: Arc::new(Mutex::new(refresh_token)),
            on_loing_expire: on_loing_expire,
        }
    }

    async fn save_token(&self, token_info: &TokenInfo) -> Result<(), ApiError> {
        let token_path = self.save_path.join("token.json");
        let token_json = serde_json::to_string(token_info).map_err(|e| ApiError {
            code: -1,
            msg: format!("序列化 token 失败: {}", e),
        })?;
        std::fs::write(token_path, token_json).map_err(|e| ApiError {
            code: -1,
            msg: format!("写入 token 文件失败: {}", e),
        })
    }

    pub async fn remove_token(&self) -> Result<(), ApiError> {
        let token_path = self.save_path.join("token.json");
        std::fs::remove_file(token_path).map_err(|e| ApiError {
            code: -1,
            msg: format!("删除 token 文件失败: {}", e),
        })
    }

    pub async fn check_token(&self) -> Result<Option<TokenInfo>, ApiError> {
        let token_path = self.save_path.join("token.json");
        if let Ok(token_str) = std::fs::read_to_string(&token_path) {
            if let Ok(token_info) = serde_json::from_str::<TokenInfo>(&token_str) {
                return Ok(Some(token_info));
            }
        }
        Ok(None)
    }

    pub async fn send(&self, builder: RequestBuilder) -> Result<Response, ApiError> {
        let mut attempts = 0;
    
        loop {
            // 如果没有 token，先刷新
            {
                let guard = self.access_token.lock().await;
                if guard.is_none() {
                    drop(guard); // 提前释放锁
                    self.refresh_access_token().await?;
                }
            }
    
            // 重新获取 token
            let token = {
                let guard = self.access_token.lock().await;
                guard.clone().ok_or(ApiError {
                    code: -1,
                    msg: "无法获取 Token".to_string(),
                })?
            };
    
            // 发送请求
            let resp = builder
                .try_clone()
                .expect("RequestBuilder 必须是可 clone 的")
                .bearer_auth(&token)
                .send()
                .await
                .map_err(|e| ApiError {
                    code: -1,
                    msg: format!("请求失败: {}", e),
                })?;
    
            if resp.status() == StatusCode::UNAUTHORIZED && attempts == 0 {
                println!("[FeishuApi] 检测到 401，尝试刷新 Token...");
                self.refresh_access_token().await?;
                attempts += 1;
                continue; // 重试
            }
    
            if resp.status() == StatusCode::UNAUTHORIZED {
                return Err(ApiError {
                    code: -1,
                    msg: "Token 刷新后仍未成功".to_string(),
                });
            }
    
            return Ok(resp);
        }
    }

    pub async fn access_token(&self, code: String) -> Result<TokenInfo, ApiError> {
        let mut params = HashMap::new();
        params.insert("grant_type", "authorization_code");
        params.insert("code", &code);
        params.insert("app_id", &self.app_id);
        params.insert("app_secret", &self.app_secret);
        params.insert("redirect_uri", &self.redirect_uri);
        
        let response = self.http_client
            .post(format!("{}/authen/v1/access_token", self.endpoint))
            .header("Content-Type", "application/json; charset=utf-8")
            .json(&params)
            .send()
            .await
            .map_err(|e| ApiError {
                code: -1,
                msg: format!("请求失败: {}", e),
            })?;
        
        let result: ApiResponse<TokenInfo> = response
            .json()
            .await
            .map_err(|e| ApiError {
                code: -1,
                msg: format!("解析响应失败: {}", e),
            })?;
        if result.code != 0 {
            return Err(ApiError {
                code: result.code,
                msg: result.msg,
            });
        }
        let token_info = result.data.unwrap();

        // 更新 access_token
        {
            let mut guard = self.access_token.lock().await;
            *guard = Some(token_info.access_token.clone());
        }
        // 更新 refresh_token
        {
            let mut guard = self.refresh_token.lock().await;
            *guard = Some(token_info.refresh_token.clone());
        }

        // 保存 token 到文件
        self.save_token(&token_info).await?;

        Ok(token_info)
    }

    pub async fn refresh_access_token(&self) -> Result<TokenInfo, ApiError> {
        if let Some(refresh_token) = self.refresh_token.lock().await.as_ref() {
            let refresh_token = refresh_token.clone();
            let mut params = HashMap::new();

            params.insert("grant_type", "refresh_token");
            params.insert("app_id", &self.app_id);
            params.insert("app_secret", &self.app_secret);
            params.insert("refresh_token", &refresh_token);
            
            let response = self.http_client
                .post(format!("{}/authen/v1/access_token", self.endpoint))
                .header("Content-Type", "application/json; charset=utf-8")
                .json(&params)
                .send()
                .await
                .map_err(|e| ApiError {
                    code: -1,
                    msg: format!("请求失败: {}", e),
                })?;
            
            let result: ApiResponse<TokenInfo> = response
                .json()
                .await
                .map_err(|e| ApiError {
                    code: -1,
                    msg: format!("解析响应失败: {}", e),
                })?;
            if result.code != 0 {
                self.on_loing_expire.as_ref().map(|f| f("刷新 access_token 失败".into()));
                return Err(ApiError {
                    code: result.code,
                    msg: result.msg,
                });
            }
            let token_info = result.data.unwrap();

            // 更新 access_token
            {
                let mut guard = self.access_token.lock().await;
                *guard = Some(token_info.access_token.clone());
            }
            // 更新 refresh_token
            {
                let mut guard = self.refresh_token.lock().await;
                *guard = Some(token_info.refresh_token.clone());
            }
            // 保存 token 到文件
            self.save_token(&token_info).await?;

            Ok(token_info)
        }else{
            return Err(ApiError {
                code: -1,
                msg: "获取 access_token 失败".into(),
            });
        }
        
    }

    pub async fn user_info(&self) -> Result<UserInfo, ApiError> {
        let response = self.send(self.http_client
            .get(format!("{}/authen/v1/user_info", self.endpoint))
        ).await
            .map_err(|e| ApiError {
                code: -1,
                msg: format!("请求失败: {}", e),
            })?;    
        let result: ApiResponse<UserInfo> = response
            .json()
            .await
            .map_err(|e| ApiError {
                code: -1,
                msg: format!("解析响应失败: {}", e),
            })?;
        if result.code != 0 {
            return Err(ApiError {
                code: result.code,
                msg: result.msg,
            });
        }
        Ok(result.data.unwrap())
    }

    /**
     * 获取根文件夹元数据
     * 根据飞书API文档: https://open.feishu.cn/document/server-docs/docs/drive-v1/folder/get-root-folder-meta
     */
    pub async fn root_folder_meta(&self) -> Result<FeishuRootMeta, ApiError> {
        
        let response = self.send(self.http_client
            .get(format!("{}/drive/explorer/v2/root_folder/meta", self.endpoint))
        ).await
            .map_err(|e| ApiError {
                code: -1,
                msg: format!("请求失败: {}", e),
            })?;
        
        let result: ApiResponse<FeishuRootMeta> = response
            .json()
            .await
            .map_err(|e| ApiError {
                code: -1,
                msg: format!("解析响应失败: {}", e),
            })?;
        if result.code != 0 {
            return Err(ApiError {
                code: result.code,
                msg: result.msg,
            });
        }
        let mut meta = result.data.unwrap();
        meta.name = Some("云盘".to_string());
        Ok(meta)
    }
    /**
     * 获取文件夹文件列表
     */
    pub async fn drive_files_pagination(&self, folder_token: Option<String>, page_size: Option<i32>, page_token: Option<String>) -> Result<FeishuFilesPagination, ApiError> {
        
        let mut query_params = vec![];
        if let Some(token) = folder_token {
            query_params.push(("folder_token", token));
        }
        if let Some(size) = page_size {
            query_params.push(("page_size", size.to_string()));
        }
        if let Some(token) = page_token {
            query_params.push(("page_token", token));
        }
        
        let response = self.send(self.http_client
            .get(format!("{}/drive/v1/files", self.endpoint))
            .query(&query_params)
        ).await
            .map_err(|e| ApiError {
                code: -1,
                msg: format!("请求失败: {}", e),
            })?;
        
        let result: ApiResponse<FeishuFilesPagination> = response
            .json()
            .await
            .map_err(|e| ApiError {
                code: -1,
                msg: format!("解析响应失败: {}", e),
            })?;

        if result.code != 0 {
            return Err(ApiError {
                code: result.code,
                msg: result.msg,
            });
        }
        Ok(result.data.unwrap())
    }

    pub async fn drive_files(&self, folder_token: Option<String>) -> Result<Vec<FeishuFile>, ApiError> {
        let page_size = 50;
        let mut files = vec![];
        let mut page_token = None;
        loop {
            let pagination = self.drive_files_pagination(folder_token.clone(), Some(page_size), page_token).await?;
            files.extend(pagination.files);
            if pagination.has_more {
                page_token = pagination.next_page_token;
            } else {
                break;
            }
        }
        Ok(files)
    }



    /**
     * 获取知识库空间列表
     */
    pub async fn wiki_spaces_pagination(&self, page_size: Option<i32>, page_token: Option<String>) -> Result<FeishuWikiSpacesPagination, ApiError> {
        
        let mut query_params = vec![];
        if let Some(size) = page_size {
            query_params.push(("page_size", size.to_string()));
        }
        if let Some(token) = page_token {
            query_params.push(("page_token", token));
        }

        let response = self.send(self.http_client
            .get(format!("{}/wiki/v2/spaces", self.endpoint))
            .query(&query_params)
        ).await
            .map_err(|e| ApiError {
                code: -1,
                msg: format!("请求失败: {}", e),
            })?;
        
        let result: ApiResponse<FeishuWikiSpacesPagination> = response
            .json()
            .await
            .map_err(|e| ApiError {
                code: -1,
                msg: format!("解析响应失败: {}", e),
            })?;
        if result.code != 0 {
            return Err(ApiError {
                code: result.code,
                msg: result.msg,
            });
        }
        Ok(result.data.unwrap())
    }

    pub async fn wiki_spaces(&self) -> Result<Vec<FeishuWikiSpace>, ApiError> {
        let page_size = 50;
        let mut spaces = vec![];
        let mut page_token = None;
        loop {
            let pagination = self.wiki_spaces_pagination(Some(page_size), page_token).await?;
            spaces.extend(pagination.items);
            if pagination.has_more {
                page_token = pagination.page_token;
            } else {
                break;
            }
        }
        Ok(spaces)
    }

    /**
     * 获取知识库空间节点
     * 根据飞书API文档: https://open.feishu.cn/document/server-docs/docs/wiki-v2/space-node/list
     */
    pub async fn space_nodes_pagination(
        &self,
        space_id: String,
        parent_node_token: Option<String>,
        page_size: Option<i32>,
        page_token: Option<String>,
    ) -> Result<FeishuWikiNodesPagination, ApiError> {
        println!("get_wiki_space_nodes: space_id: {}, parent_node_token: {:?}", space_id, parent_node_token);
        
        // 构建正确的API端点
        let url = format!("{}/wiki/v2/spaces/{}/nodes", self.endpoint, space_id);
        
        let mut query_params = vec![];
        if let Some(token) = parent_node_token {
            query_params.push(("parent_node_token", token));
        }
        if let Some(size) = page_size {
            query_params.push(("page_size", size.to_string()));
        }
        if let Some(token) = page_token {
            query_params.push(("page_token", token));
        }
        
        let response = self.send(self.http_client
            .get(&url)
            .query(&query_params)
        ).await
            .map_err(|e| ApiError {
                code: -1,
                msg: format!("请求失败: {}", e),
            })?;
        
        let result: ApiResponse<FeishuWikiNodesPagination> = response
            .json()
            .await
            .map_err(|e| ApiError {
                code: -1,
                msg: format!("解析响应失败: {}", e),
            })?;
        if result.code != 0 {
            return Err(ApiError {
                code: result.code,
                msg: result.msg,
            });
        }
        Ok(result.data.unwrap())
    }

    pub async fn space_nodes(
        &self,
        space_id: String,
        parent_node_token: Option<String>,
    ) -> Result<Vec<FeishuWikiNode>, ApiError> {
        let page_size = 50;
        let mut nodes = vec![];
        let mut page_token = None;
        loop {
            let result = self.space_nodes_pagination(
                space_id.clone(),
                parent_node_token.clone(),
                Some(page_size),
                page_token,
            ).await?;
            nodes.extend(result.items);
            if result.has_more {
                page_token = result.page_token;
            } else {
                break;
            }
        }
        Ok(nodes)
    }


/**
 * 创建导出任务
 */
pub async fn create_export_task(
    &self,
    file_token: &str,
    file_type: &str,
) -> Result<String, ApiError> {
    let extension = self.get_default_extension(file_type);
    
    let request_body = ExportTaskRequest {
        file_extension: extension.to_string(),
        token: file_token.to_string(),
        file_type: file_type.to_string(),
    };
    
    let response = self.send(self.http_client
        .post(format!("{}/drive/v1/export_tasks", self.endpoint))
        .header("Content-Type", "application/json")
        .json(&request_body)
    ).await
        .map_err(|e| ApiError {
            code: -1,
            msg: format!("创建导出任务请求失败: {}", e),
        })?;
    
    if !response.status().is_success() {
        return Err(ApiError {
            code: -1,
            msg: format!("创建导出任务失败: HTTP {}", response.status()),
        });
    }
    
    let result: ApiResponse<ExportTaskResponse> = response
        .json()
        .await
        .map_err(|e| ApiError {
            code: -1,
            msg: format!("解析导出任务响应失败: {}", e),
        })?;
    
    if result.code != 0 {
        return Err(ApiError {
            code: result.code,
            msg: format!("创建导出任务失败: {}", result.msg),
        });
    }
    
    result.data
        .map(|d| d.ticket)
        .ok_or_else(|| ApiError {
            code: -1,
            msg: "导出任务响应中缺少ticket".to_string(),
        })
}

/**
 * 查询导出任务状态
 */
async fn get_export_task_status(
    &self,
    ticket: &str,
    file_token: &str,
) -> Result<Option<String>, ApiError> {
    print!("get_export_task_status ticket:{}, file_token: {}", ticket, file_token);
    let url = format!(
        "{}/drive/v1/export_tasks/{}?token={}",
        self.endpoint, ticket, file_token
    );
    
    let response = self.send(self.http_client
        .get(&url)
    ).await
        .map_err(|e| ApiError {
            code: -1,
            msg: format!("查询导出任务状态请求失败: {}", e),
        })?;
    
    if !response.status().is_success() {
        return Err(ApiError {
            code: -1,
            msg: format!("查询导出任务状态失败: HTTP {}", response.status()),
        });
    }
    
    let result: ApiResponse<ExportTaskStatus> = response
        .json()
        .await
        .map_err(|e| ApiError {
            code: -1,
            msg: format!("解析导出任务状态响应失败: {}", e),
        })?;
    
    if result.code != 0 {
        return Err(ApiError {
            code: result.code,
            msg: format!("查询导出任务状态失败: {}", result.msg),
        });
    }
    
    Ok(result.data
        .and_then(|d| d.result)
        .and_then(|r| {
            println!("导出任务状态检查: job_status={}, job_error_msg={}", r.job_status, r.job_error_msg);
            
            // 检查任务是否成功完成 (job_status == 0 表示成功)
            if r.job_status == 0 {
                println!("导出任务成功，返回file_token: {}", r.file_token);
                Some(r.file_token)
            } else {
                println!("导出任务未完成，job_status: {}", r.job_status);
                None
            }
        }))
}

/**
 * 等待导出任务完成
 */
pub async fn wait_for_export_task(
    &self,
    ticket: &str,
    file_token: &str,
    max_retries: u32,
) -> Result<String, ApiError> {
    for _ in 0..max_retries {
        if let Some(download_token) = self.get_export_task_status(ticket, file_token).await? {
            return Ok(download_token);
        }
        
        // 等待2秒后重试
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
    }
    
    Err(ApiError {
        code: -1,
        msg: "导出任务超时".to_string(),
    })
}
/**
 * 根据文件类型获取默认导出格式
 */
fn get_default_extension(&self, file_type: &str) -> &str {
    match file_type {
        "doc" | "docx" => "docx",
        "sheet" | "bitable" => "xlsx",
        _ => "pdf",
    }
}
/**
 * 下载文件到指定路径
 */
pub async fn download_file_to_path(
    &self,
    file: &FileInfo,
    save_path: &Path,
    is_export_file: bool,
) -> Result<(), ApiError> {
    let file_token = &file.token;
    let extension = self.get_default_extension(&file.file_type);
    let file_name = format!("{}.{}", file.name, extension);
    let file_path = Path::new(&save_path)
        .join(&file.relative_path)
        .join(&file_name);

    let url = if is_export_file {
        format!(
            "{}/drive/v1/export_tasks/file/{}/download",
            self.endpoint,
            urlencoding::encode(file_token)
        )
    } else {
        format!(
            "{}/drive/v1/files/{}/download",
            self.endpoint,
            file_token
        )
    };
    
    let response = self.send(self.http_client
        .get(&url)
    ).await
        .map_err(|e| ApiError {
            code: -1,
            msg: format!("下载文件请求失败: {}", e),
        })?;
    
    if !response.status().is_success() {
        return Err(ApiError {
            code: -1,
            msg: format!("下载文件失败: url {},HTTP {}", url, response.status()),
        });
    }
    
    // 确保目录存在
    if let Some(parent) = file_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| ApiError {
                code: -1,
                msg: format!("创建目录失败: {}", e),
            })?;
    }
    
    // 创建文件
    let mut file = tokio::fs::File::create(file_path)
        .await
        .map_err(|e| ApiError {
            code: -1,
            msg: format!("创建文件失败: {}", e),
        })?;
    
    // 流式下载
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| ApiError {
            code: -1,
            msg: format!("下载数据块失败: {}", e),
        })?;
        file.write_all(&chunk)
            .await
            .map_err(|e| ApiError {
                code: -1,
                msg: format!("写入文件失败: {}", e),
            })?;
    }
    
    file.flush()
        .await
        .map_err(|e| ApiError {
            code: -1,
            msg: format!("刷新文件失败: {}", e),
        })?;
    
    Ok(())
}
}
