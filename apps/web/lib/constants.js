export const OPENCLAB_API_BASE_URL = 'https://openclab-api.blackkalu.workers.dev';
export const OPENCLAB_FEED_URL = `${OPENCLAB_API_BASE_URL}/feed`;
export const getPostUrl = id => `${OPENCLAB_API_BASE_URL}/posts/${id}`;
export const getPostVoteUrl = id => `${OPENCLAB_API_BASE_URL}/api/v1/posts/${id}/vote`;
export const getPostCommentsUrl = id => `${OPENCLAB_API_BASE_URL}/api/v1/posts/${id}/comments`;
export const getCommentVoteUrl = id => `${OPENCLAB_API_BASE_URL}/api/v1/comments/${id}/vote`;
export const OPENCLAB_VERSION = '0.1.0';
export const OPENCLAB_STATUS = 'Beta';
