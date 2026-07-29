---
title: The Photos Page
date: 2026-07-29T12:00:00Z
lang: en
duration: 3min
---

As you might have noticed, I added a [photos page](/photos) to this site. It's something I'd wanted to do for a while, without ever really getting around to it.

I already had a small homemade gallery hosted on another domain, but that meant my photos were scattered across three different places: Instagram, that separate gallery, and my personal site. Centralizing everything here made sense - one place to maintain, one design to take care of.

The real trigger, though, was Instagram. It used to be a nice, minimalist app for sharing photos, until Meta's acquisition slowly changed everything. Algorithms, ads, short videos everywhere - I put up with it. But the [change of profile photo grids' aspect ratio from square to 4:5](https://www.standard.co.uk/news/tech/instagram-update-how-adjust-profile-grid-what-changes-coming-b1205890.html) was the last straw - a decision that reframes everyone's content without offering a real alternative.

I'm lucky enough to be a developer: I can build my own platform instead of putting up with it. I [requested an export of all my Instagram data](https://accountscenter.instagram.com/info_and_permissions/dyi/), pulled my old homemade gallery back out, and imported everything onto the site. I use [`sharp`](https://github.com/lovell/sharp) to process the images, along with a [compression script](https://github.com/Alexvolkihar/alexvolkihar.me/blob/main/scripts/photos-manage.ts) that also handles metadata, so I don't have to worry about file sizes for hosting.

Here are some of [my recent photos](/photos):

<div mb-8>
  <PhotoGalleryAll :limit="12" class="gap-1!" />
</div>

Some of the images suffer a bit in quality, Instagram used to compress quite heavily. I'll probably swap a few of them for higher quality originals over time, but it's already a good starting point.

I hope to get into the habit of sharing more regularly now that I finally have my own platform for it.

Thanks for reading, and I hope you enjoy [my photos](/photos)!
