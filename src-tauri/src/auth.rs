use tauri::State;
use crate::types::{ApiError, TokenInfo, UserInfo, AppState};


/**
 * 获取访问令牌
 */
#[tauri::command]
pub async fn get_access_token(code: String, state: State<'_, AppState>) -> Result<TokenInfo, ApiError> {
    let feishu_api = state.feishu_api.clone();
    let token_info = feishu_api.access_token(code).await?;
    Ok(token_info)
}

/**
 * 刷新访问令牌
 */
#[tauri::command]
pub async fn refresh_access_token(state: State<'_, AppState>) -> Result<TokenInfo, ApiError> {
    let feishu_api = state.feishu_api.clone();
    let token_info = feishu_api.refresh_access_token().await?;
    Ok(token_info)
}

/**
 * 获取用户信息
 */
#[tauri::command]
pub async fn get_user_info(state: State<'_, AppState>) -> Result<UserInfo, ApiError> {
    let feishu_api = state.feishu_api.clone();
    let user_info = feishu_api.user_info().await?;
    Ok(user_info)
}


/**
 * 登录出
 */

#[tauri::command]
pub async fn logout(state: State<'_, AppState>) -> Result<(), ApiError> {
    let feishu_api = state.feishu_api.clone();
    feishu_api.remove_token().await?;
    Ok(())
}

/**
 * 检查登录状态
 */

 #[tauri::command]
 pub async fn check_login_status(state: State<'_, AppState>) -> Result<bool, ApiError> {
     let feishu_api = state.feishu_api.clone();
     let token_info = feishu_api.check_token().await?;
     Ok(token_info.is_some())
 }