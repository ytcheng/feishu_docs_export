use tauri::State;
use crate::feishu_api;
use crate::types::{ApiError, TokenInfo, UserInfo, AppState};


/**
 * 获取访问令牌
 */
#[tauri::command]
pub async fn get_access_token(code: String, state: State<'_, AppState>) -> Result<TokenInfo, ApiError> {
    let token_info = feishu_api::access_token(code, state).await?;
    Ok(token_info)
}

/**
 * 刷新访问令牌
 */
#[tauri::command]
pub async fn refresh_access_token(refresh_token: String, state: State<'_, AppState>) -> Result<TokenInfo, ApiError> {
    let token_info = feishu_api::refresh_access_token(refresh_token, state).await?;
    Ok(token_info)
}

/**
 * 获取用户信息
 */
#[tauri::command]
pub async fn get_user_info(access_token: String, state: State<'_, AppState>) -> Result<UserInfo, ApiError> {
    let user_info = feishu_api::user_info(access_token, state).await?;
    Ok(user_info)
}
