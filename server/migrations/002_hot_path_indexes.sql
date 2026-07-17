-- Indexes for query paths that currently full-scan (community discussions,
-- reply threads, per-sender message lookups, per-user view cleanup, and the
-- trust-score contribution counts). All additive — no schema semantics change.
CREATE INDEX IF NOT EXISTS idx_community_posts_community ON community_posts(community_id);
CREATE INDEX IF NOT EXISTS idx_community_replies_post    ON community_replies(post_id);
CREATE INDEX IF NOT EXISTS idx_community_replies_user    ON community_replies(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender           ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_startup_views_user        ON startup_views(user_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_user        ON post_comments(user_id);
