// @vitest-environment jsdom
import React, { act, type PropsWithChildren } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeishuConfig } from '../utils/feishuConfig';

const mocks = vi.hoisted(() => ({
  start: vi.fn(), cancel: vi.fn(), onUrl: vi.fn(), openUrl: vi.fn(),
  message: { error: vi.fn(), success: vi.fn() },
  resetInstance: vi.fn(), hasValidConfig: vi.fn(), checkToken: vi.fn(),
  qr: vi.fn(), unlisten: vi.fn(),
}));
vi.mock('@fabianlars/tauri-plugin-oauth', () => mocks);
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: mocks.openUrl }));
vi.mock('@tauri-apps/api/event', () => ({ emit: vi.fn(), listen: vi.fn(async () => vi.fn()) }));
vi.mock('../utils/feishuApi', () => ({
  FeishuApi: { resetInstance: mocks.resetInstance, hasValidConfig: mocks.hasValidConfig },
  feishuApi: { checkToken: mocks.checkToken },
}));
vi.mock('../utils/taskManager', () => ({ activeDownloadsManager: { stopAll: vi.fn() }, resumeDownloadingTasks: vi.fn() }));
vi.mock('./HomePage', () => ({ default: () => null }));
vi.mock('./TaskListPage', () => ({ default: () => null }));
vi.mock('./SettingsPage', () => ({
  default: ({ onConfigSaved }: { onConfigSaved: (config: FeishuConfig) => void }) => (
    <button onClick={() => {
      const config = { appId: 'cli_new_app', appSecret: 'test-secret', endpoint: 'https://open.feishu.cn/open-apis' };
      localStorage.setItem('feishu_config', JSON.stringify(config));
      onConfigSaved(config);
    }}>Save settings</button>
  ),
}));
vi.mock('antd', () => {
  const Box = ({ children }: PropsWithChildren) => <div>{children}</div>;
  return {
    App: Object.assign(Box, { useApp: () => ({ message: mocks.message }) }),
    Layout: Object.assign(Box, { Header: Box, Content: Box }),
    Typography: { Title: Box, Paragraph: Box, Text: Box },
    ConfigProvider: Box, Card: Box, Avatar: Box, Dropdown: Box, Space: Box,
  };
});
vi.mock('@ant-design/icons', () => ({ LogoutOutlined: () => null, UserOutlined: () => null }));

import AuthPage from './AuthPage';
import App from '../App';

const configA = { appId: 'cli_app_a', appSecret: 'secret-a', endpoint: 'https://open.feishu.cn/open-apis' };
const configB = { ...configA, appId: 'cli_app_b', appSecret: 'secret-b' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
let root: Root;
let host: HTMLDivElement;
async function render(node: React.ReactNode) {
  await act(async () => { root.render(node); });
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  mocks.start.mockResolvedValue(3000);
  mocks.cancel.mockResolvedValue(undefined);
  mocks.onUrl.mockResolvedValue(mocks.unlisten);
  mocks.checkToken.mockResolvedValue(false);
  mocks.hasValidConfig.mockImplementation(() => !!localStorage.getItem('feishu_config'));
  mocks.qr.mockReturnValue({ matchOrigin: () => true, matchData: () => true });
  Object.assign(window, { QRLogin: mocks.qr });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = '';
});

describe('configuration and authorization lifecycle', () => {
  it('first-run settings save starts authorization with the saved app, without restart', async () => {
    await render(<App />);
    expect(mocks.start).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain('飞书扫码授权');
    await act(async () => { host.querySelector('button')!.click(); });
    expect(mocks.resetInstance).toHaveBeenCalledWith(expect.objectContaining({ appId: 'cli_new_app' }));
    expect(mocks.qr).toHaveBeenCalledTimes(1);
    expect(mocks.qr.mock.calls[0][0].goto).toContain('client_id=cli_new_app');
  });

  it('settings navigation removes app A and saving app B creates only a fresh QR', async () => {
    localStorage.setItem('feishu_config', JSON.stringify(configA));
    await render(<App />);
    expect(mocks.qr.mock.calls[0][0].goto).toContain('client_id=cli_app_a');
    await act(async () => { host.querySelector('a')!.click(); });
    expect(mocks.cancel).toHaveBeenCalledWith(3000);
    expect(mocks.unlisten).toHaveBeenCalledTimes(1);
    expect(host.textContent).not.toContain('飞书扫码授权');
    await act(async () => { host.querySelector('button')!.click(); });
    expect(mocks.qr).toHaveBeenCalledTimes(2);
    expect(mocks.qr.mock.calls[1][0].goto).toContain('client_id=cli_new_app');
    window.dispatchEvent(new MessageEvent('message', { data: { tmp_code: 'test' } }));
    expect(mocks.openUrl).toHaveBeenCalledTimes(1);
    expect(mocks.openUrl.mock.calls[0][0]).toContain('client_id=cli_new_app');
  });

  it('starts authorization when an initially empty config becomes available', async () => {
    await render(<AuthPage authConfig={null} />);
    expect(mocks.start).not.toHaveBeenCalled();
    await render(<AuthPage authConfig={configA} />);
    expect(mocks.qr).toHaveBeenCalledTimes(1);
    expect(mocks.qr.mock.calls[0][0].goto).toContain('client_id=cli_app_a');
  });

  it('reacts to config changes and waits for the new callback port', async () => {
    await render(<AuthPage authConfig={configA} />);
    const pending = deferred<number>();
    mocks.start.mockReturnValueOnce(pending.promise);
    await render(<AuthPage authConfig={configB} />);
    expect(mocks.qr).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(3001));
    expect(mocks.qr).toHaveBeenCalledTimes(2);
    const url = new URL(mocks.qr.mock.calls[1][0].goto);
    expect(url.searchParams.get('client_id')).toBe('cli_app_b');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3001/callback');
  });

  it('waits for a pending SDK script on remount, even after the server starts', async () => {
    Object.assign(window, { QRLogin: undefined });
    const script = document.createElement('script');
    script.id = 'feishu-qr-script';
    document.body.appendChild(script);
    await render(<AuthPage authConfig={configA} />);
    expect(mocks.qr).not.toHaveBeenCalled();
    await act(async () => {
      Object.assign(window, { QRLogin: mocks.qr });
      script.dispatchEvent(new Event('load'));
    });
    expect(mocks.qr).toHaveBeenCalledTimes(1);
  });

  it('recreates an unfinished SDK script after leaving settings and a late load failure', async () => {
    Object.assign(window, { QRLogin: undefined });
    await render(<AuthPage authConfig={configA} />);
    const oldScript = document.getElementById('feishu-qr-script')!;
    await render(null);
    oldScript.dispatchEvent(new Event('error'));
    expect(document.getElementById('feishu-qr-script')).toBeNull();
    await render(<AuthPage authConfig={configB} />);
    const newScript = document.getElementById('feishu-qr-script')!;
    expect(newScript).not.toBe(oldScript);
    await act(async () => {
      Object.assign(window, { QRLogin: mocks.qr });
      newScript.dispatchEvent(new Event('load'));
    });
    expect(mocks.qr).toHaveBeenCalledTimes(1);
    expect(mocks.qr.mock.calls[0][0].goto).toContain('client_id=cli_app_b');
  });

  it('cancels a server whose startup finishes after unmount', async () => {
    const pending = deferred<number>();
    mocks.start.mockReturnValueOnce(pending.promise);
    await render(<AuthPage authConfig={configA} />);
    expect(mocks.qr).not.toHaveBeenCalled();
    await render(null);
    await act(async () => pending.resolve(3001));
    expect(mocks.cancel).toHaveBeenCalledWith(3001);
    expect(mocks.unlisten).toHaveBeenCalledTimes(1);
    expect(mocks.qr).not.toHaveBeenCalled();
  });

  it('removes a late URL listener and does not start a server after cleanup', async () => {
    const pending = deferred<() => void>();
    mocks.onUrl.mockReturnValueOnce(pending.promise);
    await render(<AuthPage authConfig={configA} />);
    await render(null);
    await act(async () => pending.resolve(mocks.unlisten));
    expect(mocks.unlisten).toHaveBeenCalledTimes(1);
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('survives StrictMode effect replay and removes unload listeners', async () => {
    await render(<React.StrictMode><AuthPage authConfig={configA} /></React.StrictMode>);
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.qr).toHaveBeenCalledTimes(1);
    await render(null);
    const count = mocks.cancel.mock.calls.length;
    window.dispatchEvent(new Event('beforeunload'));
    window.dispatchEvent(new Event('unload'));
    expect(mocks.cancel).toHaveBeenCalledTimes(count);
  });
});
