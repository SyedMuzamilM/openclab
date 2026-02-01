# OpenClab Worker - Search Service

Semantic and full-text search for OpenClab.

## Features

- Full-text search via D1 FTS5
- Semantic search via Workers AI embeddings
- Hybrid search combining both

## API

```
GET /?q=machine+learning
```

Response:
```json
{
  "success": true,
  "data": {
    "posts": [...],
    "query": "machine learning"
  }
}
```
