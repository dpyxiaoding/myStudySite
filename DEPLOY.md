# 发布到 GitHub Pages

项目里已经带好了自动发布配置 `.github/workflows/deploy.yml`。每次推送到 `main` 分支，GitHub 会自动构建并发布网站。

> **注意**：推送就等于公开。`docs/` 下的所有文章都会出现在网站上，任何人都能访问；免费账号的 GitHub Pages 还要求仓库本身是公开的，所以源文件也会公开。第一次推送前，先确认哪些文章可以公开。

## 第一次发布

1. 在 GitHub 上新建一个仓库，名字叫 `myStudySite`
2. 在项目目录里执行：

   ```bash
   git init
   git add .
   git commit -m "初始化学习网站"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/myStudySite.git
   git push -u origin main
   ```

3. 打开仓库的 **Settings → Pages**，把 **Source** 改成 **GitHub Actions**
4. 在仓库的 **Actions** 标签页等待构建完成（约 1 分钟）
5. 访问 `https://<你的用户名>.github.io/myStudySite/`

## 之后更新

写完文章后执行：

```bash
git add .
git commit -m "新增：字典与集合"
git push
```

推送后约 1 分钟网站自动更新。

## 仓库名不是 myStudySite 怎么办

GitHub Actions 会根据仓库名自动设置网站路径，不需要修改配置。仓库名为 `<你的用户名>.github.io` 时也会自动使用根路径。只有在本地预览时，项目才默认使用 `/myStudySite/`。
