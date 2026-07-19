module.exports = {
  pluginOptions: {
    electronBuilder: {
      // 渲染进程直接使用 fs/child_process 等 Node API，必须开启
      nodeIntegration: true
    }
  }
}
