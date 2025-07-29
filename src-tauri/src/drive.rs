use tauri::State;
use crate::types::{ApiError, AppState, FeishuRootMeta, FeishuFile, FeishuWikiSpace,FeishuWikiNode};

#[tauri::command]
pub async fn get_root_folder_meta(state: State<'_, AppState>) -> Result<FeishuRootMeta, ApiError> {
    let feishu_api = state.feishu_api.clone();
    let folder_meta = feishu_api.root_folder_meta().await?;
    Ok(folder_meta)
}


/**
 * 获取文件夹文件列表
 */
#[tauri::command]
pub async fn get_folder_files(
    folder_token: Option<String>,
    state: State<'_, AppState>
) -> Result<Vec<FeishuFile>, ApiError> {
    let feishu_api = state.feishu_api.clone();
    let files = feishu_api.drive_files(folder_token).await?;
    Ok(files)
}

/**
 * 获取知识库空间列表
 */
#[tauri::command]
pub async fn get_wiki_spaces(
    state: State<'_, AppState>
) -> Result<Vec<FeishuWikiSpace>, ApiError> {
    let feishu_api = state.feishu_api.clone();
    let spaces = feishu_api.wiki_spaces().await?;
    Ok(spaces)
}

/**
 * 获取知识库空间节点
 * 根据飞书API文档: https://open.feishu.cn/document/server-docs/docs/wiki-v2/space-node/list
 */
#[tauri::command]
pub async fn get_wiki_space_nodes(
    space_id: String,
    parent_node_token: Option<String>,
    state: State<'_, AppState>
) -> Result<Vec<FeishuWikiNode>, ApiError> {
    let feishu_api = state.feishu_api.clone();
    let nodes = feishu_api.space_nodes(space_id, parent_node_token).await?;
    Ok(nodes)
}