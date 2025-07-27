use tauri::State;
use crate::feishu_api;
use crate::types::{ApiError, AppState, RootFolderMeta, FeishuFile, FeishuWikiSpace,FeishuWikiNode};

#[tauri::command]
pub async fn get_root_folder_meta(access_token: String, state: State<'_, AppState>) -> Result<RootFolderMeta, ApiError> {
    let folder_meta = feishu_api::root_folder_meta(access_token, state).await?;
    Ok(folder_meta)
}


/**
 * 获取文件夹文件列表
 */
#[tauri::command]
pub async fn get_folder_files(
    access_token: String,
    folder_token: Option<String>,
    state: State<'_, AppState>
) -> Result<Vec<FeishuFile>, ApiError> {
    let files = feishu_api::drive_files(access_token, folder_token,state).await?;
    Ok(files)
}

/**
 * 获取知识库空间列表
 */
#[tauri::command]
pub async fn get_wiki_spaces(
    access_token: String,
    state: State<'_, AppState>
) -> Result<Vec<FeishuWikiSpace>, ApiError> {
    let spaces = feishu_api::wiki_spaces(access_token, state).await?;
    Ok(spaces)
}

/**
 * 获取知识库空间节点
 * 根据飞书API文档: https://open.feishu.cn/document/server-docs/docs/wiki-v2/space-node/list
 */
#[tauri::command]
pub async fn get_wiki_space_nodes(
    access_token: String,
    space_id: String,
    parent_node_token: Option<String>,
    state: State<'_, AppState>
) -> Result<Vec<FeishuWikiNode>, ApiError> {
    let nodes = feishu_api::space_nodes(access_token, space_id, parent_node_token, state).await?;
    Ok(nodes)
}