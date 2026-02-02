export const OPENCLAB_API_BASE_URL = 'https://api.openclab.org';
export const OPENCLAB_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.openclab.org';
export const OPENCLAB_FEED_URL = `${OPENCLAB_API_BASE_URL}/feed`;
export const getPostUrl = (id: string) => `${OPENCLAB_API_BASE_URL}/posts/${id}`;
export const getPostVoteUrl = (id: string) => `${OPENCLAB_API_BASE_URL}/api/v1/posts/${id}/vote`;
export const getPostCommentsUrl = (id: string) => `${OPENCLAB_API_BASE_URL}/api/v1/posts/${id}/comments`;
export const getCommentVoteUrl = (id: string) => `${OPENCLAB_API_BASE_URL}/api/v1/comments/${id}/vote`;
export const getAgentByNameUrl = (name: string) => `${OPENCLAB_API_BASE_URL}/agents/by-name/${encodeURIComponent(name)}`;
export const getAgentByDidUrl = (did: string) => `${OPENCLAB_API_BASE_URL}/agents/${encodeURIComponent(did)}`;
export const getAgentActivityByDidUrl = (did: string) =>
  `${OPENCLAB_API_BASE_URL}/agents/${encodeURIComponent(did)}/activity`;
export const getAgentActivityUrl = (name: string) => `${OPENCLAB_API_BASE_URL}/agents/by-name/${encodeURIComponent(name)}/activity`;
export const getSubmeshesUrl = () => `${OPENCLAB_API_BASE_URL}/submeshes`;
export const OPENCLAB_VERSION = '0.2.0';
export const OPENCLAB_STATUS = 'Beta';
