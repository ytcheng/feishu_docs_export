use std::collections::HashMap;
use tauri::State;
use serde::{Deserialize, Serialize};

use crate::types::{ApiResponse, ApiError, TokenInfo, UserInfo, AppState};
use crate::config::{FEISHU_APP_ID, FEISHU_APP_SECRET, FEISHU_REDIRECT_URI};

/// 根文件夹元数据结构体
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RootFolderMeta {
    pub token: String,
    pub id: String,
    pub user_id: String,
}

/**
 * 获取访问令牌
 */
#[tauri::command]
pub async fn get_access_token(code: String, state: State<'_, AppState>) -> Result<ApiResponse<TokenInfo>, ApiError> {
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
    Ok(result)
}

/**
 * 刷新访问令牌
 */
#[tauri::command]
pub async fn refresh_access_token(refresh_token: String, state: State<'_, AppState>) -> Result<ApiResponse<TokenInfo>, ApiError> {
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
    Ok(result)
}

/**
 * 获取用户信息
 */
#[tauri::command]
pub async fn get_user_info(access_token: String, state: State<'_, AppState>) -> Result<ApiResponse<UserInfo>, ApiError> {
    let client = &state.http_client;
    
    let response = client
        .get("https://open.feishu.cn/open-apis/authen/v1/user_info")
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
    Ok(result)
}

/**
 * 获取根文件夹元数据
 * 根据飞书API文档: https://open.feishu.cn/document/server-docs/docs/drive-v1/folder/get-root-folder-meta
 */
#[tauri::command]
pub async fn get_root_folder_meta(access_token: String, state: State<'_, AppState>) -> Result<ApiResponse<RootFolderMeta>, ApiError> {
    let client = &state.http_client;
    
    let response = client
        .get("https://open.feishu.cn/open-apis/drive/explorer/v2/root_folder/meta")
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| ApiError {
            code: -1,
            msg: format!("请求失败: {}", e),
        })?;
    
    let result: ApiResponse<RootFolderMeta> = response
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