---
title: Wash - Generative Art - Alexvolkihar
display: Wash
subtitle: A river painted in water, ink and watercolour
description: Wash, a deterministic series of rivers painted in three stages, flow, ink streamlines and watercolour washes, where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece is painted in three stages. First the water: a river runs between two banks, described by a stream function, so the banks are streamlines and no water leaves the bed. Stones part the current the way a cylinder parts a potential flow, eddies are shed behind them and drift down the channel, and noise added to the stream function stirs the rest, from still water to a torrent. Then the ink: the streamlines are traced at evenly spaced values of the stream function and drawn as pen strokes that swell and thin with the pressure, break where the pen was lifted, thin out where the current squeezes them together and leave a small blot where the pen rested. Last the colour: a wash is laid in the bands between the lines, one band at a time. Pigment gathers at the drying edge of each wash, settles in the grain of a cold-pressed paper, runs back into damp washes as pale blooms with dark, branching rims, bleeds into its wet neighbours or is glazed over by a second, broader layer. Beyond the banks the land is painted in earth colours with wider bands, and an island, when there is one, gets a sandy rim. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="wash" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="wash" />

## Credits

- Watercolour: a simplified, non-physical reading of Cassidy J. Curtis, Sean E. Anderson, Joshua E. Seims, Kurt W. Fleischer and David H. Salesin, "[Computer-Generated Watercolor](https://grail.cs.washington.edu/projects/watercolor/)" (SIGGRAPH 1997). There is no fluid simulation here: each wash is painted pixel by pixel with the effects their model produces once the paint has dried, namely edge darkening, granulation in the paper's valleys, back-runs and wet-in-wet bleeding, and layers are composited by adding pigment absorbances (Beer–Lambert) rather than with their Kubelka–Munk model. On the dark ground the paint is treated as opaque gouache.
- Water: the stream function of a channel with stones modelled as the potential flow around a cylinder, plus smooth noise and eddies applied as area-preserving twirls of the plane. Streamlines are the level lines of the stream function, extracted by marching squares (William E. Lorensen and Harvey E. Cline, "Marching Cubes", SIGGRAPH 1987, in its two-dimensional form) and smoothed by Chaikin's corner cutting.
- Inspired by Camille Roux and Matthieu Segret's [The Source](https://art.camilleroux.com/work/the-source/) (2023), painted in stages of water flow, ink lines and colour.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
