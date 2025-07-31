use tauri::Builder;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    Builder::default()
        .plugin(tauri_plugin_oauth::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:feishu_export.db", vec![
                    // Migration v1: 创建基础表
                    tauri_plugin_sql::Migration {
                        version: 1,
                        description: "create_initial_tables",
                        sql: r#"
                            CREATE TABLE IF NOT EXISTS download_tasks (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                name TEXT NOT NULL,
                                description TEXT,
                                status TEXT NOT NULL DEFAULT 'pending',
                                progress REAL NOT NULL DEFAULT 0.0,
                                total_files INTEGER NOT NULL DEFAULT 0,
                                downloaded_files INTEGER NOT NULL DEFAULT 0,
                                failed_files INTEGER NOT NULL DEFAULT 0,
                                output_path TEXT NOT NULL,
                                created_at TEXT NOT NULL,
                                updated_at TEXT NOT NULL
                            );
                            
                            CREATE TABLE IF NOT EXISTS download_files (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                parent_id INTEGER,
                                task_id TEXT NOT NULL,
                                name TEXT NOT NULL,
                                path TEXT NOT NULL,
                                status TEXT NOT NULL DEFAULT 'pending',
                                type TEXT NOT NULL,
                                is_leaf INTEGER NOT NULL DEFAULT 0 CHECK(is_leaf IN (0, 1)),
                                is_expanded INTEGER NOT NULL DEFAULT 0 CHECK(is_expanded IN (0, 1)),
                                file_info JSON,
                                size INTEGER DEFAULT 0,
                                downloaded_size INTEGER DEFAULT 0,
                                created_at TEXT NOT NULL,
                                updated_at TEXT NOT NULL,
                                error_message TEXT DEFAULT NULL,
                                FOREIGN KEY (task_id) REFERENCES download_tasks (id) ON DELETE CASCADE,
                                FOREIGN KEY (parent_id) REFERENCES download_files (id) ON DELETE CASCADE
                            );
                            CREATE INDEX IF NOT EXISTS idx_download_tasks_status ON download_tasks(status);
                            CREATE INDEX IF NOT EXISTS idx_download_tasks_created_at ON download_tasks(created_at);
                            CREATE INDEX IF NOT EXISTS idx_download_files_task_id ON download_files(task_id);
                            CREATE INDEX IF NOT EXISTS idx_download_files_status ON download_files(status);
                            CREATE INDEX IF NOT EXISTS idx_download_files_task_status ON download_files(task_id, status);
                            CREATE INDEX IF NOT EXISTS idx_download_files_parent_id ON download_files(parent_id);
                        "#,
                        kind: tauri_plugin_sql::MigrationKind::Up,
                    },
                ])
                .build()
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
