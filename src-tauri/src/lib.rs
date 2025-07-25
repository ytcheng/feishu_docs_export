use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;
use reqwest::Client;
// use base64::{Engine as _, engine::general_purpose};
use tauri_plugin_oauth::{OauthConfig, start_with_config};
use tauri::{Window,Emitter};
use url::Url;



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
    source_id: Option<String>,
}

// 应用状态
struct AppState {
    http_client: Client,
    download_tasks: Mutex<HashMap<String, DownloadTask>>,
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

/**
 * 获取根文件夹元数据
 */
#[tauri::command]
async fn get_root_folder_meta(access_token: String, state: State<'_, AppState>) -> Result<ApiResponse<FeishuFolder>, String> {
    let client = &state.http_client;
    
    let response = client
        .get("https://open.feishu.cn/open-apis/drive/v1/metas/batch_query")
        .header("Authorization", format!("Bearer {}", access_token))
        .query(&[("request_docs", "[{\"doc_token\":\"\",\"doc_type\":\"folder\"}]")])
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;
    
    let result: ApiResponse<FeishuFolder> = response
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
 */
#[tauri::command]
async fn get_wiki_space_nodes(
    access_token: String,
    space_id: Option<String>,
    parent_token: Option<String>,
    state: State<'_, AppState>
) -> Result<ApiResponse<serde_json::Value>, String> {
    let client = &state.http_client;
    
    let mut query_params = vec![];
    if let Some(id) = space_id {
        query_params.push(("space_id", id));
    }
    if let Some(token) = parent_token {
        query_params.push(("parent_node_token", token));
    }
    
    let response = client
        .get("https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node")
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
    task: DownloadTask,
    state: State<'_, AppState>
) -> Result<DownloadTask, String> {
    let mut tasks = state.download_tasks.lock().unwrap();
    let task_id = uuid::Uuid::new_v4().to_string();
    let mut new_task = task;
    new_task.id = task_id.clone();
    new_task.created_at = chrono::Utc::now().to_rfc3339();
    new_task.updated_at = chrono::Utc::now().to_rfc3339();
    
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
    id: String,
    updates: serde_json::Value,
    state: State<'_, AppState>
) -> Result<bool, String> {
    let mut tasks = state.download_tasks.lock().unwrap();
    if let Some(task) = tasks.get_mut(&id) {
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
 * 执行下载任务
 */
#[tauri::command]
async fn execute_download_task(
    task_id: String,
    access_token: String,
    state: State<'_, AppState>
) -> Result<bool, String> {
    // 这里应该实现下载逻辑
    println!("执行下载任务: {}", task_id);
    Ok(true)
}

/**
 * 重试下载文件
 */
#[tauri::command]
async fn retry_download_file(
    task_id: String,
    file_token: String,
    access_token: String,
    state: State<'_, AppState>
) -> Result<bool, String> {
    // 这里应该实现重试下载逻辑
    println!("重试下载文件: {} in task {}", file_token, task_id);
    Ok(true)
}

/**
 * 恢复下载任务
 */
#[tauri::command]
async fn resume_download_tasks(state: State<'_, AppState>) -> Result<(), String> {
    // 这里应该实现恢复下载逻辑
    println!("恢复下载任务");
    Ok(())
}

fn verify(url: &str, expected_state: &str) -> Option<String> {
    let url = Url::parse(url).ok()?;
    if url.path() != "/callback" { return None; }

    let mut code = None;
    let mut ok   = false;
    for (k, v) in url.query_pairs() {
        match &*k {
            "code"  => code = Some(v.into_owned()),
            "state" => ok   = v == expected_state,
            _ => {}
        }
    }
    code.filter(|_| ok)
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState {
        http_client: Client::new(),
        download_tasks: Mutex::new(HashMap::new()),
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
            resume_download_tasks
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
