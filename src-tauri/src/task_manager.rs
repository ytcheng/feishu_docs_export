use std::sync::Arc;
use std::path::Path;
use tauri::{AppHandle, Emitter, State};
use reqwest::Client;
use futures_util::StreamExt;
use tokio::io::AsyncWriteExt;
use chrono;
use std::path::PathBuf;


use crate::types::{
    ApiError, DownloadTask, CreateDownloadTaskRequest, FileInfo, 
    ExportTaskRequest, ExportTaskResponse, ExportTaskStatus, 
    DownloadProgress, ApiResponse, AppState, FeishuTreeNode, FeishuTreeNodeWrapper, FeishuFolder, FeishuFile,
};

/// 递归发现文件的函数
/// 根据飞书节点类型递归获取所有文件信息
fn discover_files_recursive<'a>(
    node: &'a FeishuTreeNodeWrapper,
    access_token: &'a str,
    state: &'a State<'a, AppState>
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<Vec<FileInfo>, ApiError>> + Send + 'a>> {
    Box::pin(async move {
        let mut files = Vec::new();
        
        match &node.node {
            FeishuTreeNode::FeishuRootMeta(root) => {
                // 根目录，获取其下的所有文件
                let drive_files = crate::feishu_api::drive_files(
                    access_token.to_string(),
                    Some(root.token.clone()),
                    state.clone()
                ).await?;
                
                for file in drive_files {
                    match file.file_type.as_str() {
                        "folder" => {
                            // 递归处理文件夹
                            let folder_node = FeishuTreeNode::FeishuFolder(crate::types::FeishuFolder {
                                token: file.token.clone(),
                                name: file.name.clone(),
                                parent_token: file.parent_token.clone(),
                                url: file.url.clone(),
                                created_time: file.created_time.clone(),
                                modified_time: file.modified_time.clone(),
                            });
                            let mut folder_path = node.path.clone();
                            folder_path.push(root.name.as_ref().unwrap().clone());
                            let mut folder_files = discover_files_recursive(
                                &FeishuTreeNodeWrapper {
                                    path: folder_path,
                                    node: folder_node,
                                },
                                access_token,
                                state
                            ).await?;
                            files.append(&mut folder_files);
                        }
                        _ => {
                            // 普通文件
                            let mut folder_path = node.path.clone();
                            folder_path.push(root.name.as_ref().unwrap().clone());
                            let path: PathBuf = folder_path.iter().collect();
                            files.push(FileInfo {
                                token: file.token,
                                name: file.name,
                                file_type: file.file_type,
                                relative_path: path,
                                space_id: None,
                                status: "pending".to_string(),
                                error: None,
                            });
                        }
                    }
                }
            }
            FeishuTreeNode::FeishuFile(file) => {
                let folder_path = node.path.clone();
                let path: PathBuf = folder_path.iter().collect();
                //快捷方式
                if file.file_type == "shortcut" {
                    files.push(FileInfo {
                        token: file.shortcut_info.as_ref().unwrap().target_token.clone(),
                        name: file.name.clone(),
                        file_type: file.shortcut_info.as_ref().unwrap().target_type.clone(),
                        relative_path: path,
                        space_id: None,
                        status: "pending".to_string(),
                        error: None,
                    });
                //普通文件
                }else{
                    files.push(FileInfo {
                        token: file.token.clone(),
                        name: file.name.clone(),
                        file_type: file.file_type.clone(),
                        relative_path: path,
                        space_id: None,
                        status: "pending".to_string(),
                        error: None,
                    });
                }
                
            }
            FeishuTreeNode::FeishuFolder(folder) => {
                // 文件夹，获取其下的所有文件
                let drive_files = crate::feishu_api::drive_files(
                    access_token.to_string(),
                    Some(folder.token.clone()),
                    state.clone()
                ).await?;
                
                for file in drive_files {
                    match file.file_type.as_str() {
                        "folder" => {
                            // 递归处理子文件夹
                            let subfolder_node = FeishuTreeNode::FeishuFolder(FeishuFolder {
                                token: file.token.clone(),
                                name: file.name.clone(),
                                parent_token: file.parent_token.clone(),
                                url: file.url.clone(),
                                created_time: file.created_time.clone(),
                                modified_time: file.modified_time.clone(),
                            });
                            let mut subfolder_path = node.path.clone();
                            subfolder_path.push(folder.name.clone());
                            let mut subfolder_files = discover_files_recursive(
                                &FeishuTreeNodeWrapper {
                                    path: subfolder_path,
                                    node: subfolder_node,
                                },
                                access_token,
                                state
                            ).await?;
                            files.append(&mut subfolder_files);
                        }
                        _ => {
                            // 普通文件
                            let subfile_node = FeishuTreeNode::FeishuFile(FeishuFile {
                                token: file.token.clone(),
                                name: file.name.clone(),
                                parent_token: file.parent_token.clone(),
                                url: file.url.clone(),
                                created_time: file.created_time.clone(),
                                modified_time: file.modified_time.clone(),
                                file_type: file.file_type.clone(),
                                shortcut_info: file.shortcut_info.clone(),
                                owner_id: file.owner_id.clone(),
                            });
                            let mut subfile_path = node.path.clone();
                            subfile_path.push(folder.name.clone());
                            let mut subfolder_files = discover_files_recursive(
                                &FeishuTreeNodeWrapper {
                                    path: subfile_path,
                                    node: subfile_node,
                                },
                                access_token,
                                state
                            ).await?;
                            files.append(&mut subfolder_files);
                        }
                    }
                }
            }
            FeishuTreeNode::FeishuWikiSpace(space) => {
                // 知识库空间，获取根节点
                let wiki_nodes = crate::feishu_api::space_nodes(
                    access_token.to_string(),
                    space.space_id.clone(),
                    None, // 获取根节点
                    state.clone()
                ).await?;
                
                for feishu_wiki_node in wiki_nodes {
                    let wiki_node = FeishuTreeNode::FeishuWikiNode(feishu_wiki_node.clone());
                    let mut node_path = node.path.clone();
                    node_path.push(space.name.clone());
                    let mut node_files = discover_files_recursive(
                        &FeishuTreeNodeWrapper {
                            path: node_path,
                            node: wiki_node,
                        },
                        access_token,
                        state
                    ).await?;
                    files.append(&mut node_files);
                }
            }
            FeishuTreeNode::FeishuWikiNode(wiki_node) => {
                // 知识库节点
                match wiki_node.obj_type.as_str() {
                    "doc" | "docx" | "sheet" | "bitable" | "mindnote" | "file" | "slides" => {
                        // 文档类型，直接添加为文件
                        let folder_path = node.path.clone();
                        let path: PathBuf = folder_path.iter().collect();   
                        files.push(FileInfo {
                            token: wiki_node.obj_token.clone(),
                            name: wiki_node.title.clone(),
                            file_type: wiki_node.obj_type.clone(),
                            relative_path: path,
                            space_id: Some(wiki_node.space_id.clone()),
                            status: "pending".to_string(),
                            error: None,
                        });
                    }
                    _ => {
                        
                    }
                }
                // 其他类型，可能是文件夹，获取子节点
                if wiki_node.has_child.unwrap_or(false) {
                    let child_nodes = crate::feishu_api::space_nodes(
                        access_token.to_string(),
                        wiki_node.space_id.clone(),
                        Some(wiki_node.node_token.clone()),
                        state.clone()
                    ).await?;
                    
                    for child_node in child_nodes {
                        let child_wiki_node = FeishuTreeNode::FeishuWikiNode(child_node.clone());
                        let mut child_path = node.path.clone();
                        child_path.push(wiki_node.title.clone());
                        let mut child_files = discover_files_recursive(
                            &FeishuTreeNodeWrapper {
                                path: child_path,
                                node: child_wiki_node,
                            },
                            access_token,
                            state
                        ).await?;
                        files.append(&mut child_files);
                    }
                }
            }
            FeishuTreeNode::FeishuWikiRoot(wiki_root) => {
                // Wiki根节点，获取所有知识库空间
                let wiki_spaces = crate::feishu_api::wiki_spaces(
                    access_token.to_string(),
                    state.clone()
                ).await?;
                
                for space in wiki_spaces {
                    let space_node = FeishuTreeNode::FeishuWikiSpace(space.clone());
                    let mut space_path = node.path.clone();
                    space_path.push(wiki_root.name.clone());

                    let mut space_files = discover_files_recursive(
                        &FeishuTreeNodeWrapper {
                            path: space_path,
                            node: space_node,
                        },
                        access_token,
                        state
                    ).await?;
                    files.append(&mut space_files);
                }
            }
        }
        
        Ok(files)
    })
}

/**
 * 创建下载任务
 */
#[tauri::command]
pub async fn create_download_task(
    task_request: CreateDownloadTaskRequest,
    state: State<'_, AppState>
) -> Result<DownloadTask, ApiError> {
    let task_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    println!("create_download_task: {:?}", task_request);
    
    let new_task = DownloadTask {
        id: task_id.clone(),
        name: task_request.name,
        description: task_request.description,
        status: "pending".to_string(),
        progress: 0.0,
        total_files: 0,
        downloaded_files: 0,
        failed_files: 0,
        output_path: task_request.output_path,
        created_at: now.clone(),
        updated_at: now,
        files: None,
        selected_nodes: Some(task_request.selected_nodes),
    };
    
    state.db.create_task(&new_task).await
        .map_err(|e| ApiError {
            code: -1,
            msg: format!("创建任务失败: {}", e),
        })?;
    
    Ok(new_task)
}

/**
 * 获取下载任务列表
 */
#[tauri::command]
pub async fn get_download_tasks(state: State<'_, AppState>) -> Result<Vec<DownloadTask>, ApiError> {
    state.db.get_all_tasks().await
        .map_err(|e| ApiError {
            code: -1,
            msg: format!("获取任务列表失败: {}", e),
        })
}

/**
 * 获取任务的文件列表
 */
#[tauri::command]
pub async fn get_task_files(
    task_id: String,
    state: State<'_, AppState>
) -> Result<Vec<FileInfo>, ApiError> {
    state.db.get_task_files(&task_id).await
        .map_err(|e| ApiError {
            code: -1,
            msg: format!("获取任务文件列表失败: {}", e),
        })
}

/**
 * 更新下载任务
 */
#[tauri::command]
pub async fn update_download_task(
    task_id: String,
    updates: serde_json::Value,
    state: State<'_, AppState>
) -> Result<bool, ApiError> {
    // 先获取现有任务
    let mut task = match state.db.get_task(&task_id).await {
        Ok(Some(task)) => task,
        Ok(None) => return Ok(false),
        Err(e) => return Err(ApiError {
            code: -1,
            msg: format!("获取任务失败: {}", e),
        }),
    };
    
    // 更新字段
    if let Some(name) = updates.get("name").and_then(|v| v.as_str()) {
        task.name = name.to_string();
    }
    if let Some(description) = updates.get("description").and_then(|v| v.as_str()) {
        task.description = Some(description.to_string());
    }
    if let Some(status) = updates.get("status").and_then(|v| v.as_str()) {
        task.status = status.to_string();
    }
    if let Some(progress) = updates.get("progress").and_then(|v| v.as_f64()) {
        task.progress = progress;
    }
    if let Some(total_files) = updates.get("total_files").and_then(|v| v.as_i64()) {
        task.total_files = total_files as i32;
    }
    if let Some(downloaded_files) = updates.get("downloaded_files").and_then(|v| v.as_i64()) {
        task.downloaded_files = downloaded_files as i32;
    }
    if let Some(failed_files) = updates.get("failed_files").and_then(|v| v.as_i64()) {
        task.failed_files = failed_files as i32;
    }
    if let Some(output_path) = updates.get("output_path").and_then(|v| v.as_str()) {
        task.output_path = output_path.to_string();
    }
    // files字段已移除，文件信息现在存储在download_files表中
    
    task.updated_at = chrono::Utc::now().to_rfc3339();
    
    state.db.update_task(&task).await
        .map_err(|e| ApiError {
            code: -1,
            msg: format!("更新任务失败: {}", e),
        })?;
    
    Ok(true)
}

/**
 * 删除下载任务
 */
#[tauri::command]
/**
 * 删除下载任务
 * 如果任务正在运行，先停止任务再删除
 */
pub async fn delete_download_task(
    id: String,
    state: State<'_, AppState>
) -> Result<bool, ApiError> {
    println!("删除任务: {}", id);
    
    // 检查任务是否正在运行，如果是则先停止
    let handle = {
        let mut active_downloads = state.active_downloads.lock().unwrap();
        active_downloads.remove(&id)
    };
    
    if let Some(handle) = handle {
        println!("任务 {} 正在运行，先停止任务", id);
        // 取消正在运行的任务
        handle.abort();
        
        // 更新任务状态为暂停
        let _ = state.db.update_task_status(&id, "paused").await;
        
        println!("任务 {} 已停止", id);
    }
    
    // 删除任务记录
    state.db.delete_task(&id).await
        .map_err(|e| ApiError {
            code: -1,
            msg: format!("删除任务失败: {}", e),
        })?;
        
    println!("任务 {} 删除成功", id);
    Ok(true)
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
) -> Result<String, ApiError> {
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
    client: &Client,
    access_token: &str,
    ticket: &str,
    file_token: &str,
) -> Result<Option<String>, ApiError> {
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
async fn wait_for_export_task(
    client: &Client,
    access_token: &str,
    ticket: &str,
    file_token: &str,
    max_retries: u32,
) -> Result<String, ApiError> {
    for _ in 0..max_retries {
        if let Some(download_token) = get_export_task_status(client, access_token, ticket, file_token).await? {
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
 * 下载文件到指定路径
 */
async fn download_file_to_path(
    client: &Client,
    access_token: &str,
    file_token: &str,
    save_path: &Path,
    is_export_file: bool,
) -> Result<(), ApiError> {
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
    if let Some(parent) = save_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| ApiError {
                code: -1,
                msg: format!("创建目录失败: {}", e),
            })?;
    }
    
    // 创建文件
    let mut file = tokio::fs::File::create(save_path)
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

async fn discover_task_files(
    task: DownloadTask,
    access_token: &str,
    state: &State<'_, AppState>,
) -> Result<(), ApiError> {
    
    let selected_nodes = match &task.selected_nodes {
        Some(nodes) => nodes.nodes(),
        None => return Ok(()),
    };
    
    let mut all_files = Vec::new();
    
    // 遍历所有选中的节点
    for node in selected_nodes {
        let mut node_files = discover_files_recursive(
            node,
            access_token,
            state
        ).await?;
        all_files.append(&mut node_files);
    }
    
    println!("发现 {} 个文件", all_files.len());
    
    // 去重：当 relative_path 和 name 都相同时只保留一份
    let mut unique_files = Vec::new();
    let mut seen_files = std::collections::HashSet::new();
    
    for file in all_files {
        let key = (file.relative_path.clone(), file.name.clone());
        if !seen_files.contains(&key) {
            seen_files.insert(key);
            unique_files.push(file);
        }
    }
    
    println!("去重后剩余 {} 个文件", unique_files.len());
    
    // 批量保存文件到数据库
    if !unique_files.is_empty() {
        state.db.create_files(&task.id, &unique_files).await
            .map_err(|e| ApiError {
                code: -1,
                msg: format!("保存文件列表失败: {}", e),
            })?;
        
        // 更新任务的总文件数
        let total_files = unique_files.len() as i32;
        state.db.update_task_progress(&task.id, 0.0, 0, 0, total_files).await
            .map_err(|e| ApiError {
                code: -1,
                msg: format!("更新任务进度失败: {}", e),
            })?;
        
        // 更新任务状态为ready
        state.db.update_task_status(&task.id, "ready").await
            .map_err(|e| ApiError {
                code: -1,
                msg: format!("更新任务状态失败: {}", e),
            })?;
    }
    
    Ok(())
}

/**
 * 支持断点续传的下载任务内部实现函数
 */
async fn start_download_task_with_resume(
    task: DownloadTask,
    access_token: String,
    app_handle: AppHandle,
    state: State<'_, AppState>,
    _is_resume: bool  // 参数保留但不再使用，逻辑已统一
) -> Result<(), ApiError> {
    let task_id = task.id.clone();
    
    // 检查任务是否已经在运行
    {
        let active_downloads = state.active_downloads.lock().unwrap();
        if active_downloads.contains_key(&task_id) {
            return Err(ApiError {
                code: -1,
                msg: "任务已在运行中".to_string(),
            });
        }
    } // MutexGuard 在这里被释放
    
    // pending任务，先根据selected_nodes获取下载文件
    if task.status == "pending"{
        discover_task_files(task.clone(), &access_token, &state).await?;
    }
    
    // 从download_files表获取文件列表
    let files = state.db.get_task_files(&task_id).await
        .map_err(|e| ApiError {
            code: -1,
            msg: format!("获取任务文件列表失败: {}", e),
        })?;
    
    if files.is_empty() {
        return Err(ApiError {
            code: -1,
            msg: "任务中没有文件".to_string(),
        });
    }
    
    // 统计当前状态
    let completed_files = state.db.get_file_count_by_status(&task_id, "completed").await
        .map_err(|e| ApiError {
            code: -1,
            msg: format!("获取已完成文件数量失败: {}", e),
        })? as i32;
    let failed_files = state.db.get_file_count_by_status(&task_id, "failed").await
        .map_err(|e| ApiError {
            code: -1,
            msg: format!("获取失败文件数量失败: {}", e),
        })? as i32;
    
    println!("开始下载任务: {}, 总文件: {}, 已完成: {}, 失败: {}", 
             task_id, files.len(), completed_files, failed_files);
    
    // 创建文件状态列表用于前端显示
    let mut files_with_status: Vec<serde_json::Value> = files.iter().map(|file| {
        serde_json::json!({
            "token": file.token,
            "name": file.name,
            "type": file.file_type,
            "relativePath": file.relative_path,
            "spaceId": file.space_id,
            "status": file.status
        })
    }).collect();
    
    // 克隆必要的数据用于异步任务
    let task_id_clone = task_id.clone();
    let access_token_clone = access_token.clone();
    let output_path = task.output_path.clone();
    let client = state.http_client.clone();
    let db = Arc::clone(&state.db);
    let active_downloads = Arc::clone(&state.active_downloads);
    
    // 启动后台下载任务
    let download_handle = tokio::spawn(async move {
        let total_files = files.len() as i32;
        let mut completed_files = 0;
        let mut failed_files = 0;
        
        // 统计已完成和失败的文件数量（从数据库状态获取）
        for file_status in &files_with_status {
            if let Some(status) = file_status["status"].as_str() {
                match status {
                    "completed" => completed_files += 1,
                    "failed" => failed_files += 1,
                    _ => {}
                }
            }
        }
        if completed_files > 0 || failed_files > 0 {
            println!("任务状态：已完成 {} 个文件，失败 {} 个文件", completed_files, failed_files);
        }
        
        // 更新任务状态为下载中
        let _ = db.update_task_status(&task_id_clone, "downloading").await;
        let current_progress = if total_files > 0 { (completed_files as f64 / total_files as f64) * 100.0 } else { 0.0 };
        let _ = db.update_task_progress(&task_id_clone, current_progress, completed_files, failed_files, total_files).await;
        
        // 发送初始进度事件
        let _ = app_handle.emit("download-progress", DownloadProgress {
            task_id: task_id_clone.clone(),
            progress: current_progress,
            completed_files,
            total_files,
            current_file: if completed_files > 0 { "恢复下载..." } else { "开始下载..." }.to_string(),
            status: "downloading".to_string(),
        });
        
        // 逐个处理文件
        for (index, file) in files.iter().enumerate() {
            // 检查文件是否已经完成
            if let Some(status) = files_with_status[index]["status"].as_str() {
                if status == "completed" {
                    println!("跳过已完成的文件: {}", file.name);
                    continue;
                }
            }
            
            println!("开始处理文件: {}, type: {}", file.name, file.file_type);
            
            // 更新当前文件状态为下载中
            files_with_status[index]["status"] = serde_json::Value::String("downloading".to_string());
            let _ = db.update_file_status(&task_id_clone, &file.token, "downloading", None).await;
            
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
                    let _ = db.update_file_status(&task_id_clone, &file.token, "completed", None).await;
                    println!("文件下载完成: {}", file.name);
                }
                Err(e) => {
                    failed_files += 1;
                    files_with_status[index]["status"] = serde_json::Value::String("failed".to_string());
                    files_with_status[index]["errorMessage"] = serde_json::Value::String(e.msg.clone());
                    let _ = db.update_file_status(&task_id_clone, &file.token, "failed", Some(&e.msg.clone())).await;
                    println!("文件下载失败: {}, 错误: {}", file.name, e.msg);
                }
            }
            
            // 更新任务进度
            let progress = (completed_files as f64 / total_files as f64) * 100.0;
            let _ = db.update_task_progress(&task_id_clone, progress, completed_files, failed_files, total_files).await;
            
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
        
        // 更新最终任务状态
        let _ = db.update_task_status(&task_id_clone, final_status).await;
        let _ = db.update_task_progress(&task_id_clone, 100.0, completed_files, failed_files, total_files).await;
        
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
    
    Ok(())
}

/**
 * 下载任务的内部实现函数（兼容性包装）
 */
async fn start_download_task_internal(
    task: DownloadTask,
    access_token: String,
    app_handle: AppHandle,
    state: State<'_, AppState>
) -> Result<(), ApiError> {
    // 调用支持断点续传的函数，is_resume=false表示新任务
    start_download_task_with_resume(task, access_token, app_handle, state, false).await
}

/**
 * 执行下载任务
 */
#[tauri::command]
pub async fn execute_download_task(
    task_id: String,
    access_token: String,
    app_handle: AppHandle,
    state: State<'_, AppState>
) -> Result<bool, ApiError> {
    println!("开始执行下载任务: {}", task_id);
    
    // 获取任务信息
    let task = state.db.get_task(&task_id).await
        .map_err(|e| ApiError{
            code: -1,
            msg: format!("获取任务失败: {}", e),
        })?
        .ok_or_else(|| ApiError{
            code: -1,
            msg: format!("任务 {} 不存在", task_id),
        })?;
    
    // 使用内部函数启动下载
    start_download_task_internal(task, access_token, app_handle, state).await?;
    
    Ok(true)
}

/**
 * 重试下载文件
 */
#[tauri::command]
pub async fn retry_download_file(
    task_id: String,
    file_token: String,
    _access_token: String,
    _state: State<'_, AppState>
) -> Result<bool, ApiError> {
    // 这里应该实现重试下载逻辑
    println!("重试下载文件: {} in task {}", file_token, task_id);
    Ok(true)
}

/**
 * 开始下载任务
 */
#[tauri::command]
pub async fn start_download_task(
    task_id: String,
    access_token: String,
    app_handle: AppHandle,
    state: State<'_, AppState>
) -> Result<(), ApiError> {
    println!("开始下载任务: {}", task_id);
    
    // 从数据库获取任务信息
    let task = match state.db.get_task(&task_id).await {
        Ok(Some(task)) => task,
        Ok(None) => return Err(ApiError{
            code: -1,
            msg: "任务不存在".to_string(),
        }),
        Err(e) => return Err(ApiError{
            code: -1,
            msg: format!("获取任务失败: {}", e),
        }),
    };
    
    // 检查任务状态
    if task.status == "downloading" {
        return Err(ApiError{
            code: -1,
            msg: "任务已在下载中".to_string(),
        });
    }
    
    if task.status == "completed" {
        return Err(ApiError{
            code: -1,
            msg: "任务已完成".to_string(),
        });
    }
    
    start_download_task_internal(task, access_token, app_handle, state).await
}

/**
 * 恢复所有下载中状态的任务（自动恢复，不包括用户手动暂停的任务）
 * 注意：此函数只恢复那些状态为 downloading 但实际没有在运行的任务
 */
#[tauri::command]
pub async fn resume_downloading_tasks(
    access_token: String,
    app_handle: AppHandle,
    state: State<'_, AppState>
) -> Result<String, ApiError> {
    println!("恢复所有下载中状态的任务");
    
    // 获取所有下载中状态的任务
    let downloading_tasks = state.db.get_autoresume_tasks().await
        .map_err(|e| ApiError{
            code: -1,
            msg: format!("获取下载中任务失败: {}", e),
        })?;
    
    if downloading_tasks.is_empty() {
        println!("没有下载中状态的任务");
        return Ok("没有需要恢复的任务".to_string());
    }
    
    // 过滤出真正需要恢复的任务（状态为 downloading 但没有在运行的）
    let mut tasks_to_resume = Vec::new();
    {
        let active_downloads = state.active_downloads.lock().unwrap();
        for task in downloading_tasks {
            if !active_downloads.contains_key(&task.id) {
                tasks_to_resume.push(task);
            } else {
                println!("任务 {} 已在运行中，跳过自动恢复", task.id);
            }
        }
    }
    
    if tasks_to_resume.is_empty() {
        println!("所有下载中状态的任务都已在运行，无需恢复");
        return Ok("所有任务都已在运行".to_string());
    }
    
    let mut resumed_count = 0;
    println!("找到 {} 个需要恢复的任务", tasks_to_resume.len());
    
    // 恢复需要恢复的任务
    for task in tasks_to_resume {
        let task_id = task.id.clone();
        let task_name = task.name.clone();
        
        println!("恢复下载任务: {} - {}", task_id, task_name);
        
        // 使用断点续传模式启动任务
        if let Err(e) = start_download_task_with_resume(
            task,
            access_token.clone(),
            app_handle.clone(),
            state.clone(),
            true // is_resume = true
        ).await {
            println!("恢复任务 {} 失败: {}", task_id, e.msg);
        } else {
            resumed_count += 1;
        }
    }
    
    Ok(format!("成功恢复 {} 个下载任务", resumed_count))
}

/**
 * 手动恢复单个暂停的任务
 */
#[tauri::command]
pub async fn resume_paused_task(
    task_id: String,
    access_token: String,
    app_handle: AppHandle,
    state: State<'_, AppState>
) -> Result<(), ApiError> {
    println!("手动恢复暂停的任务: {}", task_id);
    
    // 从数据库获取任务信息
    let task = match state.db.get_task(&task_id).await {
        Ok(Some(task)) => task,
        Ok(None) => return Err(ApiError{
            code: -1,
            msg: "任务不存在".to_string(),
        }),
        Err(e) => return Err(ApiError{
            code: -1,
            msg: format!("获取任务失败: {}", e),
        }),
    };
    
    // 检查任务状态
    if task.status != "paused" {
        return Err(ApiError{
            code: -1,
            msg: "只能恢复暂停状态的任务".to_string(),
        });
    }
    
    // 检查任务是否已经在运行
    {
        let active_downloads = state.active_downloads.lock().unwrap();
        if active_downloads.contains_key(&task_id) {
            return Err(ApiError{
                code: -1,
                msg: "任务已在运行中".to_string(),
            });
        }
    }
    
    // 使用断点续传模式启动任务
    start_download_task_with_resume(
        task,
        access_token,
        app_handle,
        state,
        true // is_resume = true
    ).await
}

/**
 * 停止下载任务
 */
#[tauri::command]
pub async fn stop_download_task(
    task_id: String,
    state: State<'_, AppState>
) -> Result<bool, ApiError> {
    println!("停止下载任务: {}", task_id);
    
    // 获取并移除任务句柄
    let handle = {
        let mut active_downloads = state.active_downloads.lock().unwrap();
        active_downloads.remove(&task_id)
    };
    
    if let Some(handle) = handle {
        // 取消任务
        handle.abort();
        
        // 更新任务状态为暂停，这样可以被恢复
        let _ = state.db.update_task_status(&task_id, "paused").await;
        
        println!("下载任务已暂停: {}", task_id);
        Ok(true)
    } else {
        Err(ApiError{
            code: -1,
            msg: format!("任务 {} 不在运行中", task_id),
        })
    }
}