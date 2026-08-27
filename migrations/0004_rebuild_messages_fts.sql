DELETE FROM messages_fts;

INSERT INTO messages_fts(id, plain_text, media_title, media_description)
SELECT
  id,
  plain_text,
  COALESCE(json_extract(media, '$[0].title'), ''),
  COALESCE(json_extract(media, '$[0].description'), '')
FROM messages;
