#!/bin/bash
# 创建 W1 功能 PR 的辅助脚本

echo "================================"
echo "W1: 侧栏「资讯」功能 PR 创建指引"
echo "================================"
echo ""
echo "✅ 代码已完成并推送到分支：cursor/sidebar-news-integration-0162"
echo "✅ 提交记录："
git log --oneline -2
echo ""
echo "📝 请通过以下方式之一创建 draft PR："
echo ""
echo "方式 1: 浏览器打开以下链接"
echo "----------------------------------------"
echo "https://github.com/haiting202-web/jiufeng-invest/compare/main...cursor/sidebar-news-integration-0162?expand=1"
echo ""
echo "方式 2: 如果您有 gh CLI 权限，运行"
echo "----------------------------------------"
echo 'gh pr create --draft --base main --head cursor/sidebar-news-integration-0162 \
  --title "feat(W1): 侧栏「资讯」嵌入 xiaoxi.report365.com.cn" \
  --body "$(cat W1-implementation-summary.md | grep -A 200 "PR 描述模板" | tail -n +3)"'
echo ""
echo "📋 PR 信息："
echo "----------------------------------------"
echo "标题：feat(W1): 侧栏「资讯」嵌入 xiaoxi.report365.com.cn"
echo "类型：draft"
echo "基础分支：main"
echo "目标分支：cursor/sidebar-news-integration-0162"
echo ""
echo "详细描述请参考：W1-implementation-summary.md"
echo ""
echo "⚠️  注意事项："
echo "- 创建时请勾选 'Create as draft'"
echo "- 测试通过后再标记为 ready for review"
echo "- 不要合入主分支，不要发 release"
echo ""
