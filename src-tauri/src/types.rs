use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use tokio::task::JoinHandle;
use crate::database::Database;

#[derive(Clone)]
pub struct AppState {
    pub http_client: reqwest::Client,
    pub db: std::sync::Arc<Database>,
    pub active_downloads: std::sync::Arc<std::sync::Mutex<HashMap<String, JoinHandle<()>>>>,
}

/// API 响应结构体
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ApiResponse<T> {
    pub code: i32,
    pub msg: String,
    pub data: Option<T>,
}

/// API 错误结构体
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ApiError {
    pub code: i32,
    pub msg: String,
}

/// 令牌信息结构体
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TokenInfo {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: i32,
    pub token_type: String,
}

/// 用户信息结构体
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserInfo {
    pub name: String,
    pub avatar_url: Option<String>,
    pub avatar_thumb: Option<String>,
    pub email: Option<String>,
    pub user_id: Option<String>,
}

/// 飞书文件结构体
// #[derive(Debug, Serialize, Deserialize, Clone)]
// pub struct FeishuFile {
//     pub token: String,
//     pub name: String,
//     #[serde(rename = "type")]
//     pub file_type: String,
//     pub parent_token: Option<String>,
//     pub url: Option<String>,
//     pub size: Option<i64>,
//     pub created_time: Option<String>,
//     pub modified_time: Option<String>,
// }

/// 飞书文件夹结构体
// #[derive(Debug, Serialize, Deserialize, Clone)]
// pub struct FeishuFolder {
//     pub token: String,
//     pub name: String,
//     pub parent_token: Option<String>,
//     pub url: Option<String>,
//     pub created_time: Option<String>,
//     pub modified_time: Option<String>,
// }

// /// 飞书知识库空间结构体
// #[derive(Debug, Serialize, Deserialize, Clone)]
// pub struct FeishuWikiSpace {
//     pub space_id: String,
//     pub name: String,
//     pub description: Option<String>,
//     pub visibility: Option<String>,
// }

// /// 飞书知识库节点结构体
// #[derive(Debug, Serialize, Deserialize, Clone)]
// pub struct FeishuWikiNode {
//     pub space_id: String,
//     pub node_token: String,
//     pub obj_token: String,
//     pub obj_type: String,
//     pub parent_node_token: Option<String>,
//     pub node_type: String,
//     pub origin_node_token: Option<String>,
//     pub origin_space_id: Option<String>,
//     pub has_child: Option<bool>,
//     pub title: String,
//     pub obj_create_time: Option<String>,
//     pub obj_edit_time: Option<String>,
//     pub node_create_time: Option<String>,
// }

/// 下载任务结构体
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DownloadTask {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub status: String,
    pub progress: f64,
    pub total_files: i32,
    pub downloaded_files: i32,
    pub failed_files: i32,
    pub output_path: String,
    pub created_at: String,
    pub updated_at: String,
    pub source_type: String,
    pub files: Option<Vec<FileInfo>>,
}

/// 创建下载任务请求结构体
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CreateDownloadTaskRequest {
    pub name: String,
    pub description: Option<String>,
    pub status: String,
    pub progress: f64,
    #[serde(rename = "totalFiles")]
    pub total_files: i32,
    #[serde(rename = "downloadedFiles")]
    pub downloaded_files: i32,
    #[serde(rename = "failedFiles")]
    pub failed_files: i32,
    #[serde(rename = "outputPath")]
    pub output_path: String,
    #[serde(rename = "sourceType")]
    pub source_type: String,
    pub files: Vec<FileInfo>,
}

// /// 创建带节点的下载任务请求结构体
// #[derive(Debug, Serialize, Deserialize, Clone)]
// pub struct CreateDownloadTaskWithNodesRequest {
//     pub name: String,
//     pub description: Option<String>,
//     pub status: String,
//     pub progress: f64,
//     #[serde(rename = "totalFiles")]
//     pub total_files: i32,
//     #[serde(rename = "downloadedFiles")]
//     pub downloaded_files: i32,
//     #[serde(rename = "failedFiles")]
//     pub failed_files: i32,
//     #[serde(rename = "outputPath")]
//     pub output_path: String,
//     #[serde(rename = "sourceType")]
//     pub source_type: String,
//     pub files: Vec<FileInfo>,
//     #[serde(rename = "selectedNodes")]
//     pub selected_nodes: Option<String>,
// }

/// 文件信息结构体
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileInfo {
    pub token: String,
    pub name: String,
    #[serde(rename = "type")]
    pub file_type: String,
    #[serde(rename = "relativePath")]
    pub relative_path: String,
    #[serde(rename = "spaceId")]
    pub space_id: Option<String>,
    pub status: String, // pending, downloading, completed, failed
    pub error: Option<String>,
}

/// 导出任务请求结构体
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExportTaskRequest {
    pub file_extension: String,
    pub token: String,
    #[serde(rename = "type")]
    pub file_type: String,
}

/// 导出任务响应结构体
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExportTaskResponse {
    pub ticket: String,
}

/// 导出任务状态结构体
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExportTaskStatus {
    pub result: Option<ExportTaskResult>,
}

/// 导出任务结果结构体
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExportTaskResult {
    pub extra: Option<serde_json::Value>,
    pub file_extension: String,
    pub file_name: String,
    pub file_size: i64,
    pub file_token: String,
    pub job_error_msg: String,
    pub job_status: i32,
    #[serde(rename = "type")]
    pub file_type: String,
}

/// 下载进度结构体
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DownloadProgress {
    pub task_id: String,
    pub progress: f64,
    pub completed_files: i32,
    pub total_files: i32,
    pub current_file: String,
    pub status: String,
}