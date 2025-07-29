// 模块声明
mod types;
mod config;
mod auth;
mod drive;
mod task_manager;
mod database;
mod feishu_api;

// 导入模块
use types::*;
use auth::*;
use drive::*;
use task_manager::*;
use database::Database;
use types::AppState;

// 标准库导入
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::runtime::Runtime;
use reqwest::Client;
use tauri::{Builder, Manager, Emitter};

use crate::config::{FEISHU_APP_ID, FEISHU_APP_SECRET, FEISHU_REDIRECT_URI};
use crate::feishu_api::FeishuApi;


/**
 * 打开目录
 * @param path 目录路径
 */
#[tauri::command]
async fn open_directory(path: String) -> Result<(), String> {
    use std::process::Command;
    
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("无法打开目录: {}", e))?;
    }
    
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("无法打开目录: {}", e))?;
    }
    
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("无法打开目录: {}", e))?;
    }
    
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    Builder::default().setup(|app| {
        let handle = app.handle().clone();
        // 使用新 API 获取路径
        let resolver = app.path();
        let data_dir = resolver.app_data_dir()
            .expect("failed to get app_data_dir");

        let app_data_dir = data_dir.join(".data");
        println!("数据目录路径: {:?}", app_data_dir);

        if !app_data_dir.exists() {
            println!("创建数据目录: {:?}", app_data_dir);
            std::fs::create_dir_all(&app_data_dir)
                .expect("Failed to create data directory");
        } else {
            println!("数据目录已存在: {:?}", app_data_dir);
        }

        let db_path = app_data_dir.join("feishu_export.db");
        let db_path_str = db_path.to_string_lossy().to_string();
        println!("数据库文件路径: {}", db_path_str);

        match std::fs::metadata(&app_data_dir) {
            Ok(metadata) => {
                println!("目录权限: {:?}", metadata.permissions());
            }
            Err(e) => {
                println!("无法获取目录元数据: {}", e);
            }
        }

        // 关键：在同步上下文里用 tokio runtime 跑异步初始化
        let rt = Runtime::new().unwrap();
        let database = rt.block_on(Database::new(&db_path_str))
            .expect("Failed to initialize database");

        let feishu_api = FeishuApi::new(FEISHU_APP_ID.to_string(), FEISHU_APP_SECRET.to_string(), FEISHU_REDIRECT_URI.to_string(), app_data_dir, Some(Box::new(move |err| {
            
            println!("登录过期，请重新登录: {}", err);
            handle.emit("login_expired", "登录过期，请重新登录").unwrap();
        })));

        let app_state = AppState {
            feishu_api: Arc::new(feishu_api),
            http_client: Client::new(),
            db: Arc::new(database),
            active_downloads: Arc::new(Mutex::new(HashMap::new())),
        };

        // 注册到状态
        app.manage(app_state);

        Ok(())
    })
        .plugin(tauri_plugin_oauth::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_access_token,
            refresh_access_token,
            get_user_info,
            logout,
            check_login_status,
            get_root_folder_meta,
            get_folder_files,
            get_wiki_spaces,
            get_wiki_space_nodes,
            create_download_task,
            get_download_tasks,
            get_task_files,
            update_download_task,
            delete_download_task,
            start_download_task,
            execute_download_task,
            retry_download_file,
            resume_downloading_tasks,
            resume_paused_task,
            stop_download_task,
            open_directory
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
