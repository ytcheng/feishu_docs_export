import { feishuApi } from './feishuApi';
import {
  FeishuRootMeta,
  FeishuFile,
  FeishuWikiSpace,
  FeishuWikiNode,
} from '../types/index';

/**
 * 飞书云盘和知识库操作工具类
 * TypeScript版本的drive模块，对应Rust版本的drive.rs
 */
export class DriveApi {
  private static instance: DriveApi;

  /**
   * 获取单例实例
   */
  static getInstance(): DriveApi {
    if (!DriveApi.instance) {
      DriveApi.instance = new DriveApi();
    }
    return DriveApi.instance;
  }

  /**
   * 获取根文件夹元数据
   */
  async getRootFolderMeta(): Promise<FeishuRootMeta> {
    try {
      const rootMeta = await feishuApi.rootFolderMeta();
      // 确保 name 字段存在，如果不存在则设置默认值
      return {
        ...rootMeta,
        name: rootMeta.name || '云盘'
      };
    } catch (error) {
      console.error('Failed to get root folder meta:', error);
      throw error;
    }
  }

  /**
   * 获取文件夹文件列表
   * @param folderToken 文件夹token，可选，默认为根文件夹
   */
  async getFolderFiles(folderToken?: string): Promise<FeishuFile[]> {
    try {
      const folderId = folderToken || 'root';
      const files = await feishuApi.driveFiles(folderId);
      return files;
    } catch (error) {
      console.error('Failed to get folder files:', error);
      throw error;
    }
  }

  /**
   * 获取知识库空间列表
   */
  async getWikiSpaces(): Promise<FeishuWikiSpace[]> {
    try {
      const spaces = await feishuApi.wikiSpaces();
      return spaces;
    } catch (error) {
      console.error('Failed to get wiki spaces:', error);
      throw error;
    }
  }

  /**
   * 获取知识库空间节点
   * @param spaceId 空间ID
   * @param parentNodeToken 父节点token，可选
   */
  async getWikiSpaceNodes(
    spaceId: string,
    parentNodeToken?: string
  ): Promise<FeishuWikiNode[]> {
    try {
      const nodes = await feishuApi.spaceNodes(spaceId, {
        parentNodeToken,
      });
      return nodes;
    } catch (error) {
      console.error('Failed to get wiki space nodes:', error);
      throw error;
    }
  }
}

// 导出单例实例
export const driveApi = DriveApi.getInstance();

// 导出便捷函数，保持与Rust版本API的一致性
export const getRootFolderMeta = () => driveApi.getRootFolderMeta();
export const getFolderFiles = (folderToken?: string) => driveApi.getFolderFiles(folderToken);
export const getWikiSpaces = () => driveApi.getWikiSpaces();
export const getWikiSpaceNodes = (spaceId: string, parentNodeToken?: string) => 
  driveApi.getWikiSpaceNodes(spaceId, parentNodeToken);