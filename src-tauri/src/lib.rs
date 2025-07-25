use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};
use reqwest::Client;

use tokio::task::JoinHandle;
use std::path::Path;
use futures_util::StreamExt;
use tokio::io::AsyncWriteExt;
use chrono;



// 飞书应用配置
const FEISHU_APP_ID: &str = "cli_a1ad86f33c38500d";
const FEISHU_APP_SECRET: &str = "iNw9h4HWv10gsyk0ZbOejhJs7YwHVQo3";
const FEISHU_REDIRECT_URI: &str = "http://localhost:3001/callback";

// 数据结构定义
#[derive(Debug, Serialize, Deserialize, Clone)]
struct ApiResponse<T> {
    code: i32,
    msg: String,
    data: Option<T>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct TokenInfo {
    access_token: String,
    refresh_token: String,
    expires_in: i32,
    token_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct UserInfo {
    name: String,
    avatar_url: Option<String>,
    avatar_thumb: Option<String>,
    email: Option<String>,
    user_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct FeishuFile {
    token: String,
    name: String,
    #[serde(rename = "type")]
    file_type: String,
    parent_token: Option<String>,
    url: Option<String>,
    size: Option<i64>,
    created_time: Option<String>,
    modified_time: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct FeishuFolder {
    token: String,
    name: String,
    parent_token: Option<String>,
    url: Option<String>,
    created_time: Option<String>,
    modified_time: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct FeishuWikiSpace {
    space_id: String,
    name: String,
    description: Option<String>,
    visibility: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct FeishuWikiNode {
    space_id: String,
    node_token: String,
    obj_token: String,
    obj_type: String,
    parent_node_token: Option<String>,
    node_type: String,
    origin_node_token: Option<String>,
    origin_space_id: Option<String>,
    has_child: Option<bool>,
    title: String,
    obj_create_time: Option<String>,
    obj_edit_time: Option<String>,
    node_create_time: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct DownloadTask {
    id: String,
    name: String,
    description: Option<String>,
    status: String,
    progress: f64,
    total_files: i32,
    downloaded_files: i32,
    failed_files: i32,
    output_path: String,
    created_at: String,
    updated_at: String,
    source_type: String,
    files: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct CreateDownloadTaskRequest {
    name: String,
    description: Option<String>,
    status: String,
    progress: f64,
    #[serde(rename = "totalFiles")]
    total_files: i32,
    #[serde(rename = "downloadedFiles")]
    downloaded_files: i32,
    #[serde(rename = "failedFiles")]
    failed_files: i32,
    #[serde(rename = "outputPath")]
    output_path: String,
    #[serde(rename = "sourceType")]
    source_type: String,
    files: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct FileInfo {
    token: String,
    name: String,
    #[serde(rename = "type")]
    file_type: String,
    #[serde(rename = "relativePath")]
    relative_path: String,
    #[serde(rename = "spaceId")]
    space_id: Option<String>,
    status: String, // pending, downloading, completed, failed
    error_message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ExportTaskRequest {
    file_extension: String,
    token: String,
    #[serde(rename = "type")]
    file_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ExportTaskResponse {
    ticket: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ExportTaskStatus {
    result: Option<ExportTaskResult>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ExportTaskResult {
    extra: Option<serde_json::Value>,
    file_extension: String,
    file_name: String,
    file_size: i64,
    file_token: String,
    job_error_msg: String,
    job_status: i32,
    #[serde(rename = "type")]
    file_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct DownloadProgress {
    task_id: String,
    progress: f64,
    completed_files: i32,
    total_files: i32,
    current_file: String,
    status: String,
}

// 应用状态
struct AppState {
    http_client: Client,
    download_tasks: Arc<Mutex<HashMap<String, DownloadTask>>>,
    active_downloads: Arc<Mutex<HashMap<String, JoinHandle<()>>>>,
}

/**
 * 获取访问令牌
 */
#[tauri::command]
async fn get_access_token(code: String, state: State<'_, AppState>) -> Result<ApiResponse<TokenInfo>, String> {
    let client = &state.http_client;
    
    let mut params = HashMap::new();
    params.insert("grant_type", "authorization_code");
    params.insert("code", &code);
    params.insert("app_id", FEISHU_APP_ID);
    params.insert("app_secret", FEISHU_APP_SECRET);
    params.insert("redirect_uri", FEISHU_REDIRECT_URI);
    
    let response = client
        .post("https://open.feishu.cn/open-apis/authen/v1/access_token")
        .json(&params)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;
    
    let result: ApiResponse<TokenInfo> = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;
    
    Ok(result)
}

/**
 * 刷新访问令牌
 */
#[tauri::command]
async fn refresh_access_token(refresh_token: String, state: State<'_, AppState>) -> Result<ApiResponse<TokenInfo>, String> {
    let client = &state.http_client;
    
    let mut params = HashMap::new();
    params.insert("grant_type", "refresh_token");
    params.insert("client_id", FEISHU_APP_ID);
    params.insert("client_secret", FEISHU_APP_SECRET);
    params.insert("refresh_token", &refresh_token);
    
    let response = client
        .post("https://open.feishu.cn/open-apis/authen/v2/oauth/token")
        .header("Content-Type", "application/json; charset=utf-8")
        .json(&params)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;
    
    let result: ApiResponse<TokenInfo> = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;
    
    Ok(result)
}

/**
 * 获取用户信息
 */
#[tauri::command]
async fn get_user_info(access_token: String, state: State<'_, AppState>) -> Result<ApiResponse<UserInfo>, String> {
    let client = &state.http_client;
    
    let response = client
        .get("https://open.feishu.cn/open-apis/authen/v1/user_info")
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;
    
    let result: ApiResponse<UserInfo> = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;
    
    Ok(result)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct RootFolderMeta {
    token: String,
    id: String,
    user_id: String,
}

/**
 * 获取根文件夹元数据
 * 根据飞书API文档: https://open.feishu.cn/document/server-docs/docs/drive-v1/folder/get-root-folder-meta
 */
#[tauri::command]
async fn get_root_folder_meta(access_token: String, state: State<'_, AppState>) -> Result<ApiResponse<RootFolderMeta>, String> {
    let client = &state.http_client;
    
    let response = client
        .get("https://open.feishu.cn/open-apis/drive/explorer/v2/root_folder/meta")
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;
    
    let result: ApiResponse<RootFolderMeta> = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;
    
    Ok(result)
}

/**
 * 获取文件夹文件列表
 */
#[tauri::command]
async fn get_folder_files(
    access_token: String,
    folder_token: Option<String>,
    page_size: Option<i32>,
    state: State<'_, AppState>
) -> Result<ApiResponse<serde_json::Value>, String> {
    let client = &state.http_client;
    
    let mut query_params = vec![];
    if let Some(token) = folder_token {
        query_params.push(("folder_token", token));
    }
    if let Some(size) = page_size {
        query_params.push(("page_size", size.to_string()));
    }
    
    let response = client
        .get("https://open.feishu.cn/open-apis/drive/v1/files")
        .header("Authorization", format!("Bearer {}", access_token))
        .query(&query_params)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;
    
    let result: ApiResponse<serde_json::Value> = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;
    
    Ok(result)
}

/**
 * 获取知识库空间列表
 */
#[tauri::command]
async fn get_wiki_spaces(
    access_token: String,
    page_size: Option<i32>,
    state: State<'_, AppState>
) -> Result<ApiResponse<serde_json::Value>, String> {
    let client = &state.http_client;
    
    let mut query_params = vec![];
    if let Some(size) = page_size {
        query_params.push(("page_size", size.to_string()));
    }
    
    let response = client
        .get("https://open.feishu.cn/open-apis/wiki/v2/spaces")
        .header("Authorization", format!("Bearer {}", access_token))
        .query(&query_params)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;
    
    let result: ApiResponse<serde_json::Value> = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;
    
    Ok(result)
}

/**
 * 获取知识库空间节点
 * 根据飞书API文档: https://open.feishu.cn/document/server-docs/docs/wiki-v2/space-node/list
 */
#[tauri::command]
async fn get_wiki_space_nodes(
    access_token: String,
    space_id: String,
    parent_node_token: Option<String>,
    state: State<'_, AppState>
) -> Result<ApiResponse<serde_json::Value>, String> {
    let client = &state.http_client;
    
    // 构建正确的API端点
    let url = format!("https://open.feishu.cn/open-apis/wiki/v2/spaces/{}/nodes", space_id);
    
    let mut query_params = vec![];
    if let Some(token) = parent_node_token {
        query_params.push(("parent_node_token", token));
    }
    
    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .query(&query_params)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;
    
    let result: ApiResponse<serde_json::Value> = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;
    
    Ok(result)
}

/**
 * 创建下载任务
 */
#[tauri::command]
async fn create_download_task(
    task_request: CreateDownloadTaskRequest,
    state: State<'_, AppState>
) -> Result<DownloadTask, String> {
    let mut tasks = state.download_tasks.lock().unwrap();
    let task_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    
    let new_task = DownloadTask {
        id: task_id.clone(),
        name: task_request.name,
        description: task_request.description,
        status: task_request.status,
        progress: task_request.progress,
        total_files: task_request.total_files,
        downloaded_files: task_request.downloaded_files,
        failed_files: task_request.failed_files,
        output_path: task_request.output_path,
        created_at: now.clone(),
        updated_at: now,
        source_type: task_request.source_type,
        files: task_request.files,
    };
    
    tasks.insert(task_id, new_task.clone());
    Ok(new_task)
}

/**
 * 获取下载任务列表
 */
#[tauri::command]
async fn get_download_tasks(state: State<'_, AppState>) -> Result<Vec<DownloadTask>, String> {
    let tasks = state.download_tasks.lock().unwrap();
    Ok(tasks.values().cloned().collect())
}

/**
 * 更新下载任务
 */
#[tauri::command]
async fn update_download_task(
    task_id: String,
    _updates: serde_json::Value,
    state: State<'_, AppState>
) -> Result<bool, String> {
    let mut tasks = state.download_tasks.lock().unwrap();
    if let Some(task) = tasks.get_mut(&task_id) {
        // 这里应该实现更新逻辑
        task.updated_at = chrono::Utc::now().to_rfc3339();
        Ok(true)
    } else {
        Ok(false)
    }
}

/**
 * 删除下载任务
 */
#[tauri::command]
async fn delete_download_task(id: String, state: State<'_, AppState>) -> Result<bool, String> {
    let mut tasks = state.download_tasks.lock().unwrap();
    Ok(tasks.remove(&id).is_some())
}

/**
 * 根据文件类型获取默认导出格式
 */
fn get_default_extension(file_type: &str) -> &str {
    match file_type {
        "doc" | "docx" => "docx",
        "sheet" | "bitable" => "xlsx",
        _ => "pdf",
    }
}

/**
 * 创建导出任务
 */
async fn create_export_task(
    client: &Client,
    access_token: &str,
    file_token: &str,
    file_type: &str,
) -> Result<String, String> {
    let extension = get_default_extension(file_type);
    
    let request_body = ExportTaskRequest {
        file_extension: extension.to_string(),
        token: file_token.to_string(),
        file_type: file_type.to_string(),
    };
    
    let response = client
        .post("https://open.feishu.cn/open-apis/drive/v1/export_tasks")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("创建导出任务请求失败: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("创建导出任务失败: HTTP {}", response.status()));
    }
    
    let result: ApiResponse<ExportTaskResponse> = response
        .json()
        .await
        .map_err(|e| format!("解析导出任务响应失败: {}", e))?;
    
    if result.code != 0 {
        return Err(format!("创建导出任务失败: {}", result.msg));
    }
    
    result.data
        .map(|d| d.ticket)
        .ok_or_else(|| "导出任务响应中缺少ticket".to_string())
}

/**
 * 查询导出任务状态
 */
async fn get_export_task_status(
    client: &Client,
    access_token: &str,
    ticket: &str,
    file_token: &str,
) -> Result<Option<String>, String> {
    print!("get_export_task_status ticket:{}, file_token: {}", ticket, file_token);
    let url = format!(
        "https://open.feishu.cn/open-apis/drive/v1/export_tasks/{}?token={}",
        ticket, file_token
    );
    
    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| format!("查询导出任务状态请求失败: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("查询导出任务状态失败: HTTP {}", response.status()));
    }
    
    let result: ApiResponse<ExportTaskStatus> = response
        .json()
        .await
        .map_err(|e| format!("解析导出任务状态响应失败: {}", e))?;
    
    if result.code != 0 {
        return Err(format!("查询导出任务状态失败: {}", result.msg));
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
async fn wait_for_export_task(
    client: &Client,
    access_token: &str,
    ticket: &str,
    file_token: &str,
    max_retries: u32,
) -> Result<String, String> {
    for _ in 0..max_retries {
        if let Some(download_token) = get_export_task_status(client, access_token, ticket, file_token).await? {
            return Ok(download_token);
        }
        
        // 等待2秒后重试
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
    }
    
    Err("导出任务超时".to_string())
}

/**
 * 下载文件到指定路径
 */
async fn download_file_to_path(
    client: &Client,
    access_token: &str,
    file_token: &str,
    save_path: &Path,
    is_export_file: bool,
) -> Result<(), String> {
    let url = if is_export_file {
        format!(
            "https://open.feishu.cn/open-apis/drive/v1/export_tasks/file/{}/download",
            urlencoding::encode(file_token)
        )
    } else {
        format!(
            "https://open.feishu.cn/open-apis/drive/v1/files/{}/download",
            file_token
        )
    };
    
    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| format!("下载文件请求失败: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("下载文件失败: url {},HTTP {}", url, response.status()));
    }
    
    // 确保目录存在
    if let Some(parent) = save_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("创建目录失败: {}", e))?;
    }
    
    // 创建文件
    let mut file = tokio::fs::File::create(save_path)
        .await
        .map_err(|e| format!("创建文件失败: {}", e))?;
    
    // 流式下载
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("下载数据块失败: {}", e))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("写入文件失败: {}", e))?;
    }
    
    file.flush()
        .await
        .map_err(|e| format!("刷新文件失败: {}", e))?;
    
    Ok(())
}

/**
 * 执行下载任务
 */
#[tauri::command]
async fn execute_download_task(
    task_id: String,
    access_token: String,
    app_handle: AppHandle,
    state: State<'_, AppState>
) -> Result<bool, String> {
    println!("开始执行下载任务: {}", task_id);
    
    // 检查任务是否已经在运行
    {
        let active_downloads = state.active_downloads.lock().unwrap();
        if active_downloads.contains_key(&task_id) {
            return Err("任务已在运行中".to_string());
        }
    }
    
    // 获取任务信息
    let task = {
        let tasks = state.download_tasks.lock().unwrap();
        tasks.get(&task_id).cloned()
    };
    
    let task = task.ok_or_else(|| format!("任务 {} 不存在", task_id))?;
    
    // 解析文件列表
    let files: Vec<FileInfo> = if let Some(files_value) = &task.files {
        serde_json::from_value(files_value.clone())
            .map_err(|e| format!("解析文件列表失败: {}", e))?
    } else {
        return Err("任务中没有文件列表".to_string());
    };
    
    // 克隆必要的数据用于异步任务
    let task_id_clone = task_id.clone();
    let access_token_clone = access_token.clone();
    let output_path = task.output_path.clone();
    let client = state.http_client.clone();
    let download_tasks = Arc::clone(&state.download_tasks);
    let active_downloads = Arc::clone(&state.active_downloads);
    
    // 启动后台下载任务
    let download_handle = tokio::spawn(async move {
        let total_files = files.len() as i32;
        let mut completed_files = 0;
        let mut failed_files = 0;
        
        // 更新任务状态为下载中
        {
            let mut tasks = download_tasks.lock().unwrap();
            if let Some(task) = tasks.get_mut(&task_id_clone) {
                task.status = "downloading".to_string();
                task.progress = 0.0;
                task.updated_at = chrono::Utc::now().to_rfc3339();
            }
        }
        
        // 发送初始进度事件
        let _ = app_handle.emit("download-progress", DownloadProgress {
            task_id: task_id_clone.clone(),
            progress: 0.0,
            completed_files: 0,
            total_files,
            current_file: "开始下载...".to_string(),
            status: "downloading".to_string(),
        });
        
        // 创建可变的文件列表副本用于更新状态
        let mut files_with_status: Vec<serde_json::Value> = files.iter().map(|file| {
            serde_json::json!({
                "token": file.token,
                "name": file.name,
                "type": file.file_type,
                "relativePath": file.relative_path,
                "spaceId": file.space_id,
                "status": "pending"
            })
        }).collect();
        
        // 逐个处理文件
        for (index, file) in files.iter().enumerate() {
            println!("开始处理文件: {}, type: {}", file.name, file.file_type);
            
            // 更新当前文件状态为下载中
            files_with_status[index]["status"] = serde_json::Value::String("downloading".to_string());
            
            // 更新任务中的文件列表
            {
                let mut tasks = download_tasks.lock().unwrap();
                if let Some(task) = tasks.get_mut(&task_id_clone) {
                    task.files = Some(serde_json::Value::Array(files_with_status.clone()));
                    task.updated_at = chrono::Utc::now().to_rfc3339();
                }
            }
            
            // 发送当前文件进度
            let _ = app_handle.emit("download-progress", DownloadProgress {
                task_id: task_id_clone.clone(),
                progress: (completed_files as f64 / total_files as f64) * 100.0,
                completed_files,
                total_files,
                current_file: file.name.clone(),
                status: "downloading".to_string(),
            });
            
            let result = if file.file_type == "file" {
                // 直接下载文件
                let file_path = Path::new(&output_path)
                    .join(&file.relative_path)
                    .join(&file.name);
                
                download_file_to_path(
                    &client,
                    &access_token_clone,
                    &file.token,
                    &file_path,
                    false,
                ).await
            } else if ["doc", "docx", "sheet", "bitable"].contains(&file.file_type.as_str()) {
                // 需要导出的文件类型
                match create_export_task(&client, &access_token_clone, &file.token, &file.file_type).await {
                    Ok(ticket) => {
                        println!("创建导出任务成功，ticket: {}", ticket);
                        
                        match wait_for_export_task(&client, &access_token_clone, &ticket, &file.token, 30).await {
                            Ok(download_token) => {
                                println!("导出任务完成，下载token: {}", download_token);
                                
                                let extension = get_default_extension(&file.file_type);
                                let file_name = format!("{}.{}", file.name, extension);
                                let file_path = Path::new(&output_path)
                                    .join(&file.relative_path)
                                    .join(&file_name);
                                
                                download_file_to_path(
                                    &client,
                                    &access_token_clone,
                                    &download_token,
                                    &file_path,
                                    true,
                                ).await
                            }
                            Err(e) => Err(e),
                        }
                    }
                    Err(e) => Err(e),
                }
            } else {
                println!("跳过不支持的文件类型: {}", file.file_type);
                Ok(()) // 跳过不支持的文件类型
            };
            
            // 根据下载结果更新文件状态
            match result {
                Ok(_) => {
                    completed_files += 1;
                    files_with_status[index]["status"] = serde_json::Value::String("completed".to_string());
                    println!("文件下载完成: {}", file.name);
                }
                Err(e) => {
                    failed_files += 1;
                    files_with_status[index]["status"] = serde_json::Value::String("failed".to_string());
                    files_with_status[index]["errorMessage"] = serde_json::Value::String(e.clone());
                    println!("文件下载失败: {}, 错误: {}", file.name, e);
                }
            }
            
            // 更新任务进度和文件列表
            let progress = (completed_files as f64 / total_files as f64) * 100.0;
            {
                let mut tasks = download_tasks.lock().unwrap();
                if let Some(task) = tasks.get_mut(&task_id_clone) {
                    task.progress = progress;
                    task.downloaded_files = completed_files;
                    task.failed_files = failed_files;
                    task.files = Some(serde_json::Value::Array(files_with_status.clone()));
                    task.updated_at = chrono::Utc::now().to_rfc3339();
                }
            }
            
            // 发送进度更新事件
            let _ = app_handle.emit("download-progress", DownloadProgress {
                task_id: task_id_clone.clone(),
                progress,
                completed_files,
                total_files,
                current_file: file.name.clone(),
                status: "downloading".to_string(),
            });
        }
        
        // 完成下载任务
        let final_status = if failed_files == 0 {
            "completed"
        } else if completed_files == 0 {
            "failed"
        } else {
            "partial"
        };
        
        {
            let mut tasks = download_tasks.lock().unwrap();
            if let Some(task) = tasks.get_mut(&task_id_clone) {
                task.status = final_status.to_string();
                task.progress = 100.0;
                task.files = Some(serde_json::Value::Array(files_with_status.clone()));
                task.updated_at = chrono::Utc::now().to_rfc3339();
            }
        }
        
        // 发送完成事件
        let _ = app_handle.emit("download-progress", DownloadProgress {
            task_id: task_id_clone.clone(),
            progress: 100.0,
            completed_files,
            total_files,
            current_file: "下载完成".to_string(),
            status: final_status.to_string(),
        });
        
        // 从活动下载列表中移除
        {
            let mut active = active_downloads.lock().unwrap();
            active.remove(&task_id_clone);
        }
        
        println!("下载任务完成: {}, 成功: {}, 失败: {}", task_id_clone, completed_files, failed_files);
    });
    
    // 将任务句柄添加到活动下载列表
    {
        let mut active_downloads = state.active_downloads.lock().unwrap();
        active_downloads.insert(task_id, download_handle);
    }
    
    Ok(true)
}

/**
 * 重试下载文件
 */
#[tauri::command]
async fn retry_download_file(
    task_id: String,
    file_token: String,
    _access_token: String,
    _state: State<'_, AppState>
) -> Result<bool, String> {
    // 这里应该实现重试下载逻辑
    println!("重试下载文件: {} in task {}", file_token, task_id);
    Ok(true)
}

/**
 * 恢复下载任务
 */
#[tauri::command]
async fn resume_download_tasks(_state: State<'_, AppState>) -> Result<(), String> {
    // 这里应该实现恢复下载逻辑
    println!("恢复下载任务");
    Ok(())
}

/**
 * 停止下载任务
 */
#[tauri::command]
async fn stop_download_task(
    task_id: String,
    state: State<'_, AppState>
) -> Result<bool, String> {
    println!("停止下载任务: {}", task_id);
    
    // 获取并移除任务句柄
    let handle = {
        let mut active_downloads = state.active_downloads.lock().unwrap();
        active_downloads.remove(&task_id)
    };
    
    if let Some(handle) = handle {
        // 取消任务
        handle.abort();
        
        // 更新任务状态
        {
            let mut tasks = state.download_tasks.lock().unwrap();
            if let Some(task) = tasks.get_mut(&task_id) {
                task.status = "cancelled".to_string();
                task.updated_at = chrono::Utc::now().to_rfc3339();
            }
        }
        
        println!("下载任务已停止: {}", task_id);
        Ok(true)
    } else {
        Err(format!("任务 {} 不在运行中", task_id))
    }
}




#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState {
        http_client: Client::new(),
        download_tasks: Arc::new(Mutex::new(HashMap::new())),
        active_downloads: Arc::new(Mutex::new(HashMap::new())),
    };
    
    tauri::Builder::default()
        .plugin(tauri_plugin_oauth::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            get_access_token,
            refresh_access_token,
            get_user_info,
            get_root_folder_meta,
            get_folder_files,
            get_wiki_spaces,
            get_wiki_space_nodes,
            create_download_task,
            get_download_tasks,
            update_download_task,
            delete_download_task,
            execute_download_task,
            retry_download_file,
            resume_download_tasks,
            stop_download_task
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
