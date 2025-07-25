use sqlx::{sqlite::SqlitePool, Row};
use std::path::Path;
use crate::{DownloadTask, FileInfo};

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
                source_type TEXT NOT NULL
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
        sqlx::query(
            r#"
            INSERT INTO download_tasks (
                id, name, description, status, progress, total_files, 
                downloaded_files, failed_files, output_path, created_at, 
                updated_at, source_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            // 获取任务的文件列表
            let files = self.get_task_files(task_id).await?;
            
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
                files: Some(files),
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
            let task_id: String = row.get("id");
            let files = self.get_task_files(&task_id).await?;
            
            tasks.push(DownloadTask {
                id: task_id,
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
                files: Some(files),
            });
        }
        Ok(tasks)
    }

    pub async fn update_task(&self, task: &DownloadTask) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE download_tasks SET 
                name = ?, description = ?, status = ?, progress = ?, 
                total_files = ?, downloaded_files = ?, failed_files = ?, 
                output_path = ?, updated_at = ?, source_type = ?
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

    /**
     * 获取正在下载的任务列表
     */
    pub async fn get_downloading_tasks(&self) -> Result<Vec<DownloadTask>, sqlx::Error> {
        let rows = sqlx::query(
            "SELECT * FROM download_tasks WHERE status = 'downloading' ORDER BY created_at ASC"
        )
        .fetch_all(&self.pool)
        .await?;

        let mut tasks = Vec::new();
        for row in rows {
            let task_id: String = row.get("id");
            let files = self.get_task_files(&task_id).await?;
            
            tasks.push(DownloadTask {
                id: task_id,
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
                files: Some(files),
            });
        }

        Ok(tasks)
    }

    /**
     * 按状态获取任务列表
     */
    pub async fn get_tasks_by_status(&self, status: &str) -> Result<Vec<DownloadTask>, sqlx::Error> {
        let rows = sqlx::query(
            "SELECT * FROM download_tasks WHERE status = ? ORDER BY created_at ASC"
        )
        .bind(status)
        .fetch_all(&self.pool)
        .await?;

        let mut tasks = Vec::new();
        for row in rows {
            let task_id: String = row.get("id");
            let files = self.get_task_files(&task_id).await?;
            
            tasks.push(DownloadTask {
                id: task_id,
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
                files: Some(files),
            });
        }

        Ok(tasks)
    }

    // ===== download_files 表操作方法 =====

    /**
     * 创建文件记录
     */
    pub async fn create_file(&self, task_id: &str, file: &FileInfo) -> Result<(), sqlx::Error> {
        let now = chrono::Utc::now().to_rfc3339();
        
        sqlx::query(
            r#"
            INSERT INTO download_files (
                task_id, token, name, file_type, relative_path, space_id, 
                status, error_message, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(task_id)
        .bind(&file.token)
        .bind(&file.name)
        .bind(&file.file_type)
        .bind(&file.relative_path)
        .bind(&file.space_id)
        .bind(&file.status)
        .bind(&file.error)
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /**
     * 批量创建文件记录
     */
    pub async fn create_files(&self, task_id: &str, files: &[FileInfo]) -> Result<(), sqlx::Error> {
        let now = chrono::Utc::now().to_rfc3339();
        
        for file in files {
            sqlx::query(
                r#"
                INSERT INTO download_files (
                    task_id, token, name, file_type, relative_path, space_id, 
                    status, error_message, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                "#,
            )
            .bind(task_id)
            .bind(&file.token)
            .bind(&file.name)
            .bind(&file.file_type)
            .bind(&file.relative_path)
            .bind(&file.space_id)
            .bind(&file.status)
            .bind(&file.error)
            .bind(&now)
            .bind(&now)
            .execute(&self.pool)
            .await?;
        }

        Ok(())
    }

    /**
     * 获取任务的所有文件
     */
    pub async fn get_task_files(&self, task_id: &str) -> Result<Vec<FileInfo>, sqlx::Error> {
        let rows = sqlx::query(
            "SELECT * FROM download_files WHERE task_id = ? ORDER BY created_at ASC"
        )
        .bind(task_id)
        .fetch_all(&self.pool)
        .await?;

        let mut files = Vec::new();
        for row in rows {
            files.push(FileInfo {
                token: row.get("token"),
                name: row.get("name"),
                file_type: row.get("file_type"),
                relative_path: row.get("relative_path"),
                space_id: row.get("space_id"),
                status: row.get("status"),
                error: row.get("error_message"),
            });
        }

        Ok(files)
    }

    /**
     * 更新文件状态
     */
    pub async fn update_file_status(
        &self,
        task_id: &str,
        file_token: &str,
        status: &str,
        error: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        let now = chrono::Utc::now().to_rfc3339();
        
        sqlx::query(
            "UPDATE download_files SET status = ?, error_message = ?, updated_at = ? WHERE task_id = ? AND token = ?"
        )
        .bind(status)
        .bind(error)
        .bind(&now)
        .bind(task_id)
        .bind(file_token)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /**
     * 获取任务中指定状态的文件数量
     */
    pub async fn get_file_count_by_status(&self, task_id: &str, status: &str) -> Result<i32, sqlx::Error> {
        let row = sqlx::query(
            "SELECT COUNT(*) as count FROM download_files WHERE task_id = ? AND status = ?"
        )
        .bind(task_id)
        .bind(status)
        .fetch_one(&self.pool)
        .await?;

        Ok(row.get::<i64, _>("count") as i32)
    }

    /**
     * 删除任务的所有文件记录
     */
    pub async fn delete_task_files(&self, task_id: &str) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM download_files WHERE task_id = ?")
            .bind(task_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}