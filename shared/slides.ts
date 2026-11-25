import type { Site, StillShape } from './types';

// Slideshows: a reel's slides posted as pictures to swipe through (a TikTok
// photo post, an Instagram carousel, a multi-photo post on Threads, Facebook
// and X). Where a platform takes no such post, the same slides go up as the
// reel's video.

export interface SlideSite {
  /** The most pictures one post takes there. */
  max: number;
  /** The picture shape that fills its feed best. */
  shape: StillShape;
  /** What the post is called there. */
  name: string;
}

/** The platforms a slideshow goes up on as a photo post. Not here = video only (YouTube), or one picture per post (Pinterest). */
export const SLIDE_SITES: Partial<Record<Site, SlideSite>> = {
  instagram: { max: 10, shape: 'portrait', name: 'carousel' },
  tiktok: { max: 10, shape: 'vertical', name: 'photo post' },
  threads: { max: 10, shape: 'portrait', name: 'photo thread' },
  facebook: { max: 10, shape: 'portrait', name: 'photo post' },
  x: { max: 4, shape: 'portrait', name: 'photo post' },
};
