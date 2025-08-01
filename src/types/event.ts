import { DownloadFile } from "../types/database";

export interface FilesDiscoveredEvent {
  task_id: number;
  new_files: DownloadFile[];

}