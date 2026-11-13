---
title: Galaxy - Generative Art - Alexvolkihar
display: Galaxy
subtitle: Spiral and elliptical galaxies grown from nested, rotated orbits
description: Galaxy, a deterministic series of spiral, barred, elliptical and irregular galaxies where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

No arm is ever drawn here. Every star sits on an oval orbit around the centre, and each orbit is turned a little more than the one inside it; where neighbouring orbits come close, stars pile up, and two spiral arms appear on their own. This is the picture behind the density-wave theory: arms are a traffic jam that stars drive through, not a structure that winds up. Inside a bar, the orbits stretch and line up instead of turning. Hot blue stars, pink H II regions and dark dust lanes are then placed where the jam is densest, the dust just inside each arm. A Sérsic bulge, a viewing angle that can tilt the disc until it is edge-on, and sometimes a satellite or a second galaxy linked by a faint stream of stars complete the plate. Ellipticals have no disc and no arms, so they are built from what deep photographs show around them: a smooth r^1/4 body with a bright core and a halo that fades over many radii, thin shells left on alternating sides by a swallowed companion, a swarm of globular clusters, the brightest red giants of the halo resolved one by one, sometimes a warped dust lane across the core or a short jet from the nucleus, and the dwarf and background galaxies of the cluster they sit in. Light is added up in floating-point buffers, dimmed by the dust, given a glow and developed on near-black, or printed as a photographic negative. Press **New seed** for a fresh hash, then share the URL to show someone that exact galaxy.

</div>

<GenArtGallery series="galaxy" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds. Types follow Edwin Hubble's sequence: Sa to Sd from big bulge and tight arms to small bulge and loose, patchy arms, SBa to SBc for their barred cousins.

<GenArtTraits series="galaxy" />

## Credits

- Spiral structure: the density-wave theory of C. C. Lin and F. H. Shu, "On the Spiral Structure of Disk Galaxies" (_The Astrophysical Journal_ 140, 1964), and Agris Kalnajs's figure of nested, progressively rotated elliptical orbits (_Proceedings of the Astronomical Society of Australia_ 2, 1973) that shows how such a pattern arises from crowding orbits.
- Rendering method: Ingo Berg's [Rendering a galaxy with the density wave theory](https://beltoforion.de/en/spiral_galaxy_renderer/), which turns the rotated ellipses into a renderer, with a de Vaucouleurs bulge and K. C. Freeman's exponential disc. This implementation is written from that description, with its own additions: a bar of aligned orbits, three- and four-fold ovals, an arm-contrast map that places young stars, H II regions and dust (on the inner edge of the arms), and a projection for inclined and edge-on views.
- Ellipticals: G. de Vaucouleurs' r^1/4 law and its generalisation by J. L. Sérsic, with b(n) from L. Ciotti and G. Bertin (_Astronomy & Astrophysics_ 352, 1999) and boxy or discy isophotes after R. Bender's a4 parameter; the light is computed per pixel and shown through a power stretch. Shells follow D. F. Malin and D. Carter's plates of NGC 3923 and other shell galaxies (_The Astrophysical Journal_ 274, 1983), drawn as limb-brightened arcs with a sharp outer edge. The warped dust lane is modelled on Centaurus A (NGC 5128), the one-sided knotty jet on M87, and the swarm of blue and red globular clusters on the bimodal cluster systems of giant ellipticals.
- Profiles: radii are drawn from J. L. Sérsic's profile (a Gamma law in the scaled radius) and from an exponential disc, through tabulated inverse distributions. Faint light is smoothed more than bright light, so sparse outskirts do not turn to grain on small canvases. Star colours follow a temperature ramp in the spirit of Mitchell Charity's blackbody colour table.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
