/** Shared vendor-shaped fixtures for gateway mapper tests. */

export const trackNode = {
  id: 'vid001',
  title: 'Fix You',
  item_type: 'song',
  duration: { text: '4:55', seconds: 295 },
  artists: [{ name: 'Coldplay', channel_id: 'UCcold' }],
  album: { id: 'MPREb_xy', name: 'X&Y' },
  thumbnails: [
    { url: 'https://img/small.jpg', width: 60, height: 60 },
    { url: 'https://img/large.jpg', width: 544, height: 544 },
  ],
};

export const trackNodeTextTitle = {
  ...trackNode,
  id: 'vid002',
  title: { text: 'The Scientist' },
};

export const videoNode = {
  id: 'vid003',
  title: { text: 'Coldplay - Yellow (Official Video)' },
  item_type: 'video',
  duration: { text: '4:32', seconds: 272 },
  artists: [{ name: 'Coldplay', channel_id: 'UCcold' }],
};

export const albumNode = {
  id: 'MPREb_xy',
  title: { text: 'X&Y' },
  item_type: 'album',
  subtitle: { text: 'Album • Coldplay • 2005' },
  thumbnails: [{ url: 'https://img/album.jpg', width: 226, height: 226 }],
};

export const artistNode = {
  id: 'UCcold',
  title: { text: 'Coldplay' },
  item_type: 'artist',
  subtitle: { text: 'Artist • 25.4M subscribers' },
};

export const playlistNode = {
  id: 'PLxyz',
  title: { text: 'RoadTrip' },
  item_type: 'playlist',
  item_count: '42',
  author: { name: 'Ada' },
};

export const podcastNode = {
  id: 'PLpod',
  title: { text: 'The Daily Show' },
  item_type: 'podcast_show',
};

export const playlistTrackNode = {
  ...trackNode,
  set_video_id: 'SV_abc123',
};

export const albumPageFixture = {
  header: {
    title: { text: 'X&Y' },
    subtitle: { text: 'Coldplay • 2005' },
    description: { text: 'Third studio album.' },
    thumbnails: [{ url: 'https://img/album-large.jpg', width: 544, height: 544 }],
  },
  contents: [trackNode, trackNodeTextTitle],
};

export const artistPageFixture = {
  header: {
    title: { text: 'Coldplay' },
    subscribers: { text: '25.4M subscribers' },
    description: { text: 'British rock band.' },
  },
  sections: [
    { header: { title: { text: 'Top songs' } }, contents: [trackNode] },
    { header: { title: { text: 'Albums' } }, items: [albumNode] },
    { header: { title: { text: 'Singles & EPs' } }, items: [{ ...albumNode, id: 'MPREb_single', subtitle: { text: 'Single • 2002' } }] },
  ],
};

export const playlistPageFixture = {
  header: {
    title: { text: 'RoadTrip' },
    description: { text: 'Songs for the road.' },
  },
  contents: [playlistTrackNode, trackNodeTextTitle],
};

export const libraryFixture = {
  contents: [
    { header: { title: { text: 'Albums' } }, items: [albumNode] },
    { header: { title: { text: 'Artists' } }, items: [artistNode] },
    { header: { title: { text: 'Playlists' } }, items: [playlistNode] },
    { header: { title: { text: 'Recently played' } }, items: [trackNode] },
  ],
};

export const trackInfoFixture = {
  basic_info: {
    id: 'vid001',
    title: 'Fix You',
    author: 'Coldplay',
    channel_id: 'UCcold',
    duration: 295,
  },
};

export const searchPageFixture = {
  contents: [{ contents: [trackNode, albumNode, artistNode, playlistNode] }],
  has_continuation: false,
};
