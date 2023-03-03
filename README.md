# koishi-plugin-adapter-wechaty

Koishi 微信适配器。

## 安装

### npm

```bash
npm install koishi-plugin-adapter-wechaty
```

## 配置

```yaml
plugins:
  adapter-wechaty:
    name: 'koishi' # Wechaty 配置文件保存路径。
    puppet: 'wechaty-puppet-wechat' # 支持 wechat 和 xp 两种。xp 只在 WIndows 支持。
```

## 使用方法

### wechaty-puppet-wechat

启动插件，并在 Koishi 控制台的『日志』或是 stdout 中查看二维码，扫描登录。

### wechaty-puppet-xp

仅限 Windows 操作系统，需要安装 [特定版本微信](https://github.com/tom-snow/wechat-windows-versions/releases/download/v3.6.0.18/WeChatSetup-3.6.0.18.exe)。

先在本地的微信中登录，然后启动该插件。
