import type { Series } from '../types'
import { features, renderFaultLines, TRAITS } from '../faultLines'

export default {
  slug: 'fault-lines',
  title: 'Fault Lines',
  summary: 'A slab cut again and again by straight faults until it breaks into hatched, drifting shards.',
  order: 20,
  traits: TRAITS,
  features,
  render: renderFaultLines,
  // The first 12 seeds of the genart skill's contact sheet for seed-of-seeds
  // 0xc0ffee… — the sample that was reviewed, not hand-picked tiles.
  gallery: [
    '0x20c7a90b2d892bed9ecf896640cd16d289d7c3ab29299d3ba469d9f2a2a3ad47',
    '0x7f8c37682d12ffc28e100a81d7d1cf818330ffc27bb914ba584528e5027ce09f',
    '0xfd245256efd68e8ed916de7d536c7c787e6e0f13cfbbe9ddf9b5a267f6f9f103',
    '0xafdcece340e206b11f53253bc0a342cfce94989e1b41d54ec5925e9b9654fc72',
    '0x08138b825cc777b0cb4e21f41ab35984500e571679e5d5e5857d265898f372ff',
    '0xdbd30fd28f79ba868e48c0b1fd08c2a91281bf5b7fe6622a32f8362b3a37b3d7',
    '0xdb93cdc4c4e55b1968f4baddf16c63e59ef679cc8133138373c790a8e28d7635',
    '0x93184a6d81a5624d31f2bc89db1b80fb4d228f1aeffddb1e5a091830647f73f0',
    '0x1b04886da4b8c8171ce298b07afe5da8fbd0d0e75c2657c4f3afba20da691f83',
    '0x34252c634c77bc366f75ea2da1e21e1760ab8ca619fd467326723593385d3255',
    '0x85b959397960e5657067d319643fc90d417ac09cbe0876472587d18039556035',
    '0xc87b5d7155d2b2a8208d2184677200143d21a37352a45bd6c0d97a27feb59f22',
  ],
} satisfies Series
