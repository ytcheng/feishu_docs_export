use sqlx::{sqlite::SqlitePool, Row};
use serde_json;
use std::path::Path;
use crate::DownloadTask;

pub struct Database {
    pool: SqlitePool,
}

impl Database {
    pub async fn new(db_path: &str) -> Result<Self, sqlx::Error> {
        // 确保数据库文件的目录存在
        if let Some(parent) = Path::new(db_path).parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                sqlx::Error::Io(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    format!("Failed to create database directory: {}", e),
                ))
            })?;
        }

        let pool = SqlitePool::connect(&format!("sqlite://{}?mode=rwc", db_path)).await?;
        
        let db = Database { pool };
        db.init_tables().await?;
        Ok(db)
    }

    async fn init_tables(&self) -> Result<(), sqlx::Error> {
        // 创建下载任务表
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS download_tasks (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                status TEXT NOT NULL,
                progress REAL NOT NULL DEFAULT 0.0,
                total_files INTEGER NOT NULL DEFAULT 0,
                downloaded_files INTEGER NOT NULL DEFAULT 0,
                failed_files INTEGER NOT NULL DEFAULT 0,
                output_path TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                source_type TEXT NOT NULL,
                files TEXT
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // 创建文件信息表
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS download_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id TEXT NOT NULL,
                token TEXT NOT NULL,
                name TEXT NOT NULL,
                file_type TEXT NOT NULL,
                relative_path TEXT NOT NULL,
                space_id TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                error_message TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (task_id) REFERENCES download_tasks (id) ON DELETE CASCADE
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn create_task(&self, task: &DownloadTask) -> Result<(), sqlx::Error> {
        let files_json = task.files.as_ref()
            .map(|f| serde_json::to_string(f).unwrap_or_else(|_| "[]".to_string()))
            .unwrap_or_else(|| "[]".to_string());

        sqlx::query(
            r#"
            INSERT INTO download_tasks (
                id, name, description, status, progress, total_files, 
                downloaded_files, failed_files, output_path, created_at, 
                updated_at, source_type, files
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&task.id)
        .bind(&task.name)
        .bind(&task.description)
        .bind(&task.status)
        .bind(task.progress)
        .bind(task.total_files)
        .bind(task.downloaded_files)
        .bind(task.failed_files)
        .bind(&task.output_path)
        .bind(&task.created_at)
        .bind(&task.updated_at)
        .bind(&task.source_type)
        .bind(&files_json)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_task(&self, task_id: &str) -> Result<Option<DownloadTask>, sqlx::Error> {
        let row = sqlx::query(
            "SELECT * FROM download_tasks WHERE id = ?"
        )
        .bind(task_id)
        .fetch_optional(&self.pool)
        .await?;

        if let Some(row) = row {
            let files_str: String = row.get("files");
            let files = serde_json::from_str(&files_str).ok();

            Ok(Some(DownloadTask {
                id: row.get("id"),
                name: row.get("name"),
                description: row.get("description"),
                status: row.get("status"),
                progress: row.get("progress"),
                total_files: row.get("total_files"),
                downloaded_files: row.get("downloaded_files"),
                failed_files: row.get("failed_files"),
                output_path: row.get("output_path"),
                created_at: row.get("created_at"),
                updated_at: row.get("updated_at"),
                source_type: row.get("source_type"),
                files,
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn get_all_tasks(&self) -> Result<Vec<DownloadTask>, sqlx::Error> {
        let rows = sqlx::query(
            "SELECT * FROM download_tasks ORDER BY created_at DESC"
        )
        .fetch_all(&self.pool)
        .await?;

        let mut tasks = Vec::new();
        for row in rows {
            let files_str: String = row.get("files");
            let files = serde_json::from_str(&files_str).ok();

            tasks.push(DownloadTask {
                id: row.get("id"),
                name: row.get("name"),
                description: row.get("description"),
                status: row.get("status"),
                progress: row.get("progress"),
                total_files: row.get("total_files"),
                downloaded_files: row.get("downloaded_files"),
                failed_files: row.get("failed_files"),
                output_path: row.get("output_path"),
                created_at: row.get("created_at"),
                updated_at: row.get("updated_at"),
                source_type: row.get("source_type"),
                files,
            });
        }

        Ok(tasks)
    }

    pub async fn update_task(&self, task: &DownloadTask) -> Result<(), sqlx::Error> {
        let files_json = task.files.as_ref()
            .map(|f| serde_json::to_string(f).unwrap_or_else(|_| "[]".to_string()))
            .unwrap_or_else(|| "[]".to_string());

        sqlx::query(
            r#"
            UPDATE download_tasks SET 
                name = ?, description = ?, status = ?, progress = ?, 
                total_files = ?, downloaded_files = ?, failed_files = ?, 
                output_path = ?, updated_at = ?, source_type = ?, files = ?
            WHERE id = ?
            "#,
        )
        .bind(&task.name)
        .bind(&task.description)
        .bind(&task.status)
        .bind(task.progress)
        .bind(task.total_files)
        .bind(task.downloaded_files)
        .bind(task.failed_files)
        .bind(&task.output_path)
        .bind(&task.updated_at)
        .bind(&task.source_type)
        .bind(&files_json)
        .bind(&task.id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn delete_task(&self, task_id: &str) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM download_tasks WHERE id = ?")
            .bind(task_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn update_task_progress(
        &self,
        task_id: &str,
        progress: f64,
        downloaded_files: i32,
        failed_files: i32,
    ) -> Result<(), sqlx::Error> {
        let now = chrono::Utc::now().to_rfc3339();
        
        sqlx::query(
            "UPDATE download_tasks SET progress = ?, downloaded_files = ?, failed_files = ?, updated_at = ? WHERE id = ?"
        )
        .bind(progress)
        .bind(downloaded_files)
        .bind(failed_files)
        .bind(&now)
        .bind(task_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn update_task_status(
        &self,
        task_id: &str,
        status: &str,
    ) -> Result<(), sqlx::Error> {
        let now = chrono::Utc::now().to_rfc3339();
        
        sqlx::query(
            "UPDATE download_tasks SET status = ?, updated_at = ? WHERE id = ?"
        )
        .bind(status)
        .bind(&now)
        .bind(task_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }
}