use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use tokio::task::JoinHandle;
use crate::database::Database;
use sqlx::{Encode, Type, decode::Decode, Sqlite, sqlite::SqliteValueRef};
use sqlx::encode::IsNull;
use sqlx::database::HasArguments;
use sqlx::error::BoxDynError;
use std::path::PathBuf;

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

/// 根文件夹元数据结构体
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FeishuRootMeta {
    pub name: Option<String>,
    pub token: String,
    pub id: String,
    pub user_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FeishuFileShortcutInfo {
    pub target_type: String,
    pub target_token: String,
}
// 飞书文件结构体
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FeishuFile {
    pub token: String,
    pub name: String,
    #[serde(rename = "type")]
    pub file_type: String,
    pub parent_token: Option<String>,
    pub url: Option<String>,
    pub shortcut_info: Option<FeishuFileShortcutInfo>,
    pub created_time: Option<String>,
    pub modified_time: Option<String>,
    pub owner_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FeishuFilesPagination {
    pub files: Vec<FeishuFile>,
    pub next_page_token: Option<String>,
    pub has_more: bool,
}
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FeishuWikiRoot{
    pub name: String,
}

/// 飞书文件夹结构体
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FeishuFolder {
    pub token: String,
    pub name: String,
    pub parent_token: Option<String>,
    pub url: Option<String>,
    pub created_time: Option<String>,
    pub modified_time: Option<String>,
}

/// 飞书知识库空间结构体
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FeishuWikiSpace {
    pub space_id: String,
    pub name: String,
    pub description: Option<String>,
    pub visibility: Option<String>,
    pub space_type: String,
    pub open_sharing: String,
}
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FeishuWikiSpacesPagination {
    pub items: Vec<FeishuWikiSpace>,
    pub page_token: Option<String>,
    pub has_more: bool,
}
/// 飞书知识库节点结构体
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FeishuWikiNode {
    pub space_id: String,
    pub node_token: String,
    pub obj_token: String,
    pub obj_type: String,
    pub parent_node_token: Option<String>,
    pub node_type: String,
    pub origin_node_token: Option<String>,
    pub origin_space_id: Option<String>,
    pub has_child: Option<bool>,
    pub title: String,
    pub obj_create_time: Option<String>,
    pub obj_edit_time: Option<String>,
    pub node_create_time: Option<String>,
    pub creator: Option<String>,
    pub owner: Option<String>,
    pub node_creator: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FeishuWikiNodesPagination {
    pub items: Vec<FeishuWikiNode>,
    pub page_token: Option<String>,
    pub has_more: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", content = "fileItem")]
pub enum FeishuTreeNode{
    FeishuRootMeta(FeishuRootMeta),
    FeishuFile(FeishuFile),
    FeishuFolder(FeishuFolder),
    FeishuWikiRoot(FeishuWikiRoot),
    FeishuWikiSpace(FeishuWikiSpace),
    FeishuWikiNode(FeishuWikiNode),
}
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FeishuTreeNodeWrapper {
    pub path: Vec<String>,
    #[serde(flatten)]
    pub node: FeishuTreeNode,
}
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FeishuTree(Vec<FeishuTreeNodeWrapper>);

impl FeishuTree {
    pub fn nodes(&self) -> &Vec<FeishuTreeNodeWrapper> {
        &self.0
    }
}
impl Type<Sqlite> for FeishuTree {
    fn type_info() -> <Sqlite as sqlx::Database>::TypeInfo {
        <String as Type<Sqlite>>::type_info()
    }
}

impl<'q> Encode<'q, Sqlite> for FeishuTree {
    fn encode_by_ref(
        &self,
        buf: &mut <Sqlite as HasArguments<'q>>::ArgumentBuffer,
    ) -> IsNull {
        let json = serde_json::to_string(self).unwrap();
        <String as Encode<Sqlite>>::encode_by_ref(&json, buf)
    }

    fn size_hint(&self) -> usize {
        let json = serde_json::to_string(self).unwrap();
        <String as Encode<Sqlite>>::size_hint(&json)
    }
}

impl<'r> Decode<'r, Sqlite> for FeishuTree {
    fn decode(value: SqliteValueRef<'r>) -> Result<Self, BoxDynError> {
        let s = <String as Decode<Sqlite>>::decode(value)?;
        let tree = serde_json::from_str(&s)?;
        Ok(tree)
    }
}
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
    pub files: Option<Vec<FileInfo>>,
    pub selected_nodes: Option<FeishuTree>,
}

/// 创建下载任务请求结构体
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CreateDownloadTaskRequest {
    pub name: String,
    pub description: Option<String>,
    #[serde(rename = "outputPath")]
    pub output_path: String,
    #[serde(rename = "selectedNodes")]
    pub selected_nodes: FeishuTree,
}

/// 文件信息结构体
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileInfo {
    pub token: String,
    pub name: String,
    #[serde(rename = "type")]
    pub file_type: String,
    #[serde(rename = "relativePath")]
    pub relative_path: PathBuf,
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