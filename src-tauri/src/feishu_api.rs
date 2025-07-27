use tauri::State;

use crate::types::{ApiResponse, ApiError, AppState};

/**
 * 获取文件夹文件列表
 */
#[tauri::command]
pub async fn get_folder_files(
    access_token: String,
    folder_token: Option<String>,
    page_size: Option<i32>,
    state: State<'_, AppState>
) -> Result<ApiResponse<serde_json::Value>, ApiError> {
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
        .map_err(|e| ApiError {
            code: -1,
            msg: format!("请求失败: {}", e),
        })?;
    
    let result: ApiResponse<serde_json::Value> = response
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
    Ok(result)
}

/**
 * 获取知识库空间列表
 */
#[tauri::command]
pub async fn get_wiki_spaces(
    access_token: String,
    page_size: Option<i32>,
    state: State<'_, AppState>
) -> Result<ApiResponse<serde_json::Value>, ApiError> {
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
        .map_err(|e| ApiError {
            code: -1,
            msg: format!("请求失败: {}", e),
        })?;
    
    let result: ApiResponse<serde_json::Value> = response
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
    Ok(result)
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
) -> Result<ApiResponse<serde_json::Value>, ApiError> {
    let client = &state.http_client;
    println!("get_wiki_space_nodes: space_id: {}, parent_node_token: {:?}", space_id, parent_node_token);
    
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
        .map_err(|e| ApiError {
            code: -1,
            msg: format!("请求失败: {}", e),
        })?;
    
    let result: ApiResponse<serde_json::Value> = response
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
    Ok(result)
}