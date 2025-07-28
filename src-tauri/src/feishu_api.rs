use std::collections::HashMap;
use tauri::State;
use crate::{config::{FEISHU_APP_ID, FEISHU_APP_SECRET, FEISHU_REDIRECT_URI}, types::{ApiError, ApiResponse, AppState, FeishuFilesPagination, FeishuFile, FeishuWikiNode, FeishuWikiNodesPagination, FeishuWikiSpacesPagination, FeishuWikiSpace, FeishuRootMeta, TokenInfo, UserInfo}};


pub const FEISHU_ENDPOINT: &str = "https://open.feishu.cn/open-apis";

pub async fn access_token(code: String, state: State<'_, AppState>) -> Result<TokenInfo, ApiError> {
    let client = &state.http_client;
    
    let mut params = HashMap::new();
    params.insert("grant_type", "authorization_code");
    params.insert("code", &code);
    params.insert("app_id", FEISHU_APP_ID);
    params.insert("app_secret", FEISHU_APP_SECRET);
    params.insert("redirect_uri", FEISHU_REDIRECT_URI);
    
    let response = client
        .post(format!("{}/authen/v1/access_token", FEISHU_ENDPOINT))
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
    Ok(result.data.unwrap())
}

pub async fn user_info(access_token: String, state: State<'_, AppState>) -> Result<UserInfo, ApiError> {
    let client = &state.http_client;
    let response = client
        .get(format!("{}/authen/v1/user_info", FEISHU_ENDPOINT))
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
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

pub async fn refresh_access_token(refresh_token: String, state: State<'_, AppState>) -> Result<TokenInfo, ApiError> {
    let client = &state.http_client;
    
    let mut params = HashMap::new();
    params.insert("grant_type", "refresh_token");
    params.insert("client_id", FEISHU_APP_ID);
    params.insert("client_secret", FEISHU_APP_SECRET);
    params.insert("refresh_token", &refresh_token);
    
    let response = client
        .post(format!("{}/authen/v1/access_token", FEISHU_ENDPOINT))
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
    Ok(result.data.unwrap())
}

/**
 * 获取根文件夹元数据
 * 根据飞书API文档: https://open.feishu.cn/document/server-docs/docs/drive-v1/folder/get-root-folder-meta
 */
pub async fn root_folder_meta(access_token: String, state: State<'_, AppState>) -> Result<FeishuRootMeta, ApiError> {
    let client = &state.http_client;
    
    let response = client
        .get(format!("{}/drive/explorer/v2/root_folder/meta", FEISHU_ENDPOINT))
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
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
pub async fn drive_files_pagination(
    access_token: String,
    folder_token: Option<String>,
    page_size: Option<i32>,
    page_token: Option<String>,
    state: State<'_, AppState>
) -> Result<FeishuFilesPagination, ApiError> {
    let client = &state.http_client;
    
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
    
    let response = client
        .get(format!("{}/drive/v1/files", FEISHU_ENDPOINT))
        .header("Authorization", format!("Bearer {}", access_token))
        .query(&query_params)
        .send()
        .await
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

pub async fn drive_files(
    access_token: String,
    folder_token: Option<String>,
    state: State<'_, AppState>
) -> Result<Vec<FeishuFile>, ApiError> {
    let page_size = 50;
    let mut files = vec![];
    let mut page_token = None;
    loop {
        let pagination = drive_files_pagination(access_token.clone(), folder_token.clone(), Some(page_size), page_token, state.clone()).await?;
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
pub async fn wiki_spaces_pagination(
    access_token: String,
    page_size: Option<i32>,
    page_token: Option<String>,
    state: State<'_, AppState>
) -> Result<FeishuWikiSpacesPagination, ApiError> {
    let client = &state.http_client;
    
    let mut query_params = vec![];
    if let Some(size) = page_size {
        query_params.push(("page_size", size.to_string()));
    }
    if let Some(token) = page_token {
        query_params.push(("page_token", token));
    }

    let response = client
        .get(format!("{}/wiki/v2/spaces", FEISHU_ENDPOINT))
        .header("Authorization", format!("Bearer {}", access_token))
        .query(&query_params)
        .send()
        .await
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

pub async fn wiki_spaces(
    access_token: String,
    state: State<'_, AppState>
) -> Result<Vec<FeishuWikiSpace>, ApiError> {
    let page_size = 50;
    let mut spaces = vec![];
    let mut page_token = None;
    loop {
        let pagination = wiki_spaces_pagination(access_token.clone(), Some(page_size), page_token, state.clone()).await?;
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
    access_token: String,
    space_id: String,
    parent_node_token: Option<String>,
    page_size: Option<i32>,
    page_token: Option<String>,
    state: State<'_, AppState>
) -> Result<FeishuWikiNodesPagination, ApiError> {
    let client = &state.http_client;
    println!("get_wiki_space_nodes: space_id: {}, parent_node_token: {:?}", space_id, parent_node_token);
    
    // 构建正确的API端点
    let url = format!("{}/wiki/v2/spaces/{}/nodes", FEISHU_ENDPOINT, space_id);
    
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
    access_token: String,
    space_id: String,
    parent_node_token: Option<String>,
    state: State<'_, AppState>
) -> Result<Vec<FeishuWikiNode>, ApiError> {
    let page_size = 50;
    let mut nodes = vec![];
    let mut page_token = None;
    loop {
        let result = space_nodes_pagination(
            access_token.clone(),
            space_id.clone(),
            parent_node_token.clone(),
            Some(page_size),
            page_token,
            state.clone()
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