/**
 * dsh-ai-invest-sidebar host entry.
 *
 * 服务端入口：注册插件主体，宿主侧无额外逻辑（UI 全在客户端注入）。
 * 客户端入口见 ./client/client.js。
 */

export const name = 'dsh-ai-invest-sidebar';

/**
 * Register the plugin against the host context.
 * UI 定制全部通过客户端 slot 注入完成，宿主侧为空实现。
 */
export function apply() {
  // no host-side work: all UI customization happens in the client entry.
}
