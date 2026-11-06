-- 清理端到端回归产生的测试数据
-- 只匹配测试脚本生成的账号前缀，避免误删真实用户：
--   pub_/priv_/r1_..r5_/viewer_/peer_  → 内容安全回归
--   rl_[abcd]_                        → 限流回归
--   tok_                              → 双 Token 回归
BEGIN;

CREATE TEMP TABLE dc_test_user_ids AS
SELECT id FROM users
WHERE email LIKE '%@example.com'
  -- 注意：限流回归的账号形如 rl_c58_xxxx@example.com（前缀带序号），
  -- 只写 [abcd] 会漏掉两位数编号，这里显式允许编号。
  AND email ~ '^(pub|priv|r[1-9]|viewer|peer|rl_[abcd][0-9]*|tok)_';

DELETE FROM reports
WHERE reporter_id IN (SELECT id FROM dc_test_user_ids)
   OR (
     target_type = 'post'
     AND target_id IN (
       SELECT id FROM daily_posts WHERE user_id IN (SELECT id FROM dc_test_user_ids)
     )
   );

DELETE FROM moderation_actions
WHERE target_type = 'post'
  AND target_id IN (
    SELECT id FROM daily_posts WHERE user_id IN (SELECT id FROM dc_test_user_ids)
  );

DELETE FROM post_status_history
WHERE post_id IN (
  SELECT id FROM daily_posts WHERE user_id IN (SELECT id FROM dc_test_user_ids)
);

DELETE FROM blocks
WHERE blocker_id IN (SELECT id FROM dc_test_user_ids)
   OR blocked_id IN (SELECT id FROM dc_test_user_ids);

DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM dc_test_user_ids);

DELETE FROM daily_posts WHERE user_id IN (SELECT id FROM dc_test_user_ids);

DELETE FROM users WHERE id IN (SELECT id FROM dc_test_user_ids);

COMMIT;

SELECT
  (SELECT count(*) FROM users) AS users,
  (SELECT count(*) FROM daily_posts) AS posts,
  (SELECT count(*) FROM reports) AS reports,
  (SELECT count(*) FROM blocks) AS blocks,
  (SELECT count(*) FROM post_status_history) AS history,
  (SELECT count(*) FROM moderation_actions) AS actions;
