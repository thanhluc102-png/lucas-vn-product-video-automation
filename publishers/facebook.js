// publishers/facebook.js
// Dang video len Facebook Page Reels qua Meta Graph API (edge "video_reels").
// Flow: start upload session -> upload byte video truc tiep (khong can host
// cong khai) -> cho xu ly -> finish/publish.
//
// Can 2 bien environment:
//   FB_PAGE_ID             - id cua Facebook Page
//   FB_PAGE_ACCESS_TOKEN   - Page Access Token dai han, quyen toi thieu:
//                            pages_show_list, pages_read_engagement, pages_manage_posts
//
// Tham khao: https://developers.facebook.com/docs/video-api/guides/reels-publishing/

import fsp from 'node:fs/promises';

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function log(msg) {
  console.log(`[facebook] ${msg}`);
}

async function startUploadSession(pageId, accessToken) {
  const res = await fetch(`${GRAPH_BASE}/${pageId}/video_reels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ upload_phase: 'start', access_token: accessToken }),
  });
  const json = await res.json();
  if (!res.ok || !json.video_id) {
    throw new Error(`Facebook start upload that bai: ${JSON.stringify(json)}`);
  }
  return json; // { video_id, upload_url }
}

async function uploadVideoBytes(videoId, accessToken, filePath) {
  const buf = await fsp.readFile(filePath);
  const res = await fetch(`https://rupload.facebook.com/video-upload/${GRAPH_VERSION}/${videoId}`, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${accessToken}`,
      offset: '0',
      file_size: String(buf.length),
    },
    body: buf,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success !== true) {
    throw new Error(`Facebook upload video that bai: ${JSON.stringify(json)}`);
  }
}

async function waitUntilProcessed(videoId, accessToken, { timeoutMs = 120000, intervalMs = 3000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(
      `${GRAPH_BASE}/${videoId}?fields=status&access_token=${encodeURIComponent(accessToken)}`
    );
    const json = await res.json();
    const uploading = json.status?.uploading_phase?.status;
    const processing = json.status?.processing_phase?.status;
    log(`  status: uploading=${uploading} processing=${processing}`);
    if (uploading === 'error' || processing === 'error') {
      throw new Error(`Facebook xu ly video loi: ${JSON.stringify(json.status)}`);
    }
    if (uploading === 'complete' && (processing === 'complete' || processing === undefined)) {
      return;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  log('  qua thoi gian cho xu ly, van thu publish...');
}

async function commentOnPost(postId, message, accessToken) {
  const res = await fetch(`${GRAPH_BASE}/${postId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, access_token: accessToken }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Facebook comment that bai: ${JSON.stringify(json)}`);
  }
  return json; // { id: comment_id }
}

async function finishAndPublish(pageId, videoId, accessToken, { description, title } = {}) {
  const params = new URLSearchParams({
    upload_phase: 'finish',
    video_id: videoId,
    video_state: 'PUBLISHED',
    access_token: accessToken,
  });
  if (description) params.set('description', description);
  if (title) params.set('title', title);

  const res = await fetch(`${GRAPH_BASE}/${pageId}/video_reels?${params.toString()}`, { method: 'POST' });
  const json = await res.json();
  if (!res.ok || json.success !== true) {
    throw new Error(`Facebook publish that bai: ${JSON.stringify(json)}`);
  }
  return json; // { success, post_id }
}

export async function publishReelToFacebook(videoPath, { description, title, linkComment } = {}) {
  const pageId = process.env.FB_PAGE_ID;
  const accessToken = process.env.FB_PAGE_ACCESS_TOKEN;
  if (!pageId || !accessToken) {
    throw new Error('Thieu FB_PAGE_ID / FB_PAGE_ACCESS_TOKEN trong environment.');
  }

  log(`Bat dau upload session cho page ${pageId}...`);
  const { video_id: videoId } = await startUploadSession(pageId, accessToken);

  log(`Upload video (video_id=${videoId})...`);
  await uploadVideoBytes(videoId, accessToken, videoPath);

  log('Cho Facebook xu ly video...');
  await waitUntilProcessed(videoId, accessToken);

  log('Publish Reel...');
  const result = await finishAndPublish(pageId, videoId, accessToken, { description, title });
  log(`Da dang! post_id=${result.post_id || '(khong co)'}`);

  if (linkComment && result.post_id) {
    try {
      // Graph API doi ID dang "{page_id}_{post_id}" cho edge /comments — goi
      // bang post_id tran se bao loi (#12) "singular statuses API is
      // deprecated" (da xac nhan qua test truc tiep).
      await commentOnPost(`${pageId}_${result.post_id}`, linkComment, accessToken);
      log('Da them comment link san pham.');
    } catch (e) {
      log(`Khong the them comment link (bo qua, post chinh van thanh cong): ${e.message}`);
    }
  }

  return result;
}
