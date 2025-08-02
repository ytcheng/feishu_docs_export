import { DownloadFile } from "../types/database";

export interface FilesDiscoveredEvent {
  task_id: number;
  new_files: DownloadFile[];
}

export interface TokenExpiredEvent {
  message: string;
  timestamp: number;
}

export interface AuthSuccessEvent {
  message: string;
}