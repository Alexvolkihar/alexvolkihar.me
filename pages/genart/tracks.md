---
title: Tracks - Generative Art - Alexvolkihar
display: Tracks
subtitle: Bubble-chamber photographs of imaginary events
description: Tracks, a deterministic series of simulated bubble-chamber photographs where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

A bubble chamber is a tank of superheated liquid in a strong magnetic field: a charged particle crossing it leaves a trail of tiny bubbles, photographed a few milliseconds later. Each frame here is one such photograph of an event that never happened. A beam of parallel tracks comes in, and some of them hit a proton of the liquid. Sprays of secondaries curl one way or the other depending on their charge. Slow particles leave dense trails and spiral in as they stop. Neutral particles leave a gap and then the V of their decay, and photons turn into electron-positron pairs that curl in opposite directions. With the beam off, only cosmic rays and stray gamma rays cross the chamber. Every particle is simulated with its real mass, lifetime and energy loss, then printed on film with fiducial crosses, edge marks, a frame counter, scratches and dust. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="tracks" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="tracks" />

- **Event**: _Interaction_ is a pion beam on hydrogen with one or two stars and elastic scatters. _Strange_ is a kaon beam producing hyperons and neutral kaons (kinks, V decays, a stopped kaon captured into a sigma and a pion). _Showers_ is a neon-hydrogen mixture, short enough in radiation length for photons to convert and electrons to radiate. _Cosmic_ has the beam off: muons crossing a propane chamber, stopping pions and muons with their decay electrons, Compton electrons and sometimes a nuclear star. _Pile-up_ is a dense beam with several interactions.
- **Field**: 1, 2 or 3.5 tesla. The radius of a track is its transverse momentum divided by 0.3 times the field.

## Credits

- The bubble chamber was invented by Donald A. Glaser (1952). The frames are modelled on photographs from the CERN, Brookhaven and Berkeley hydrogen and heavy-liquid chambers, but no photograph is reproduced.
- Particle masses, lifetimes, branching ratios and material constants come from the [Particle Data Group](https://pdg.lbl.gov/)'s Review of Particle Physics. Energy loss follows the Bethe formula, with the relativistic rise flattened as the density effect does in liquids. Multiple scattering follows Highland's formula (V. L. Highland, 1975, as refined by Lynch & Dahl, 1991). Delta rays use the Rutherford knock-on spectrum, and bremsstrahlung and pair production use the Bethe–Heitler laws, all as summarised in the PDG chapter _Passage of particles through matter_.
- Decays are two-body decays boosted into the lab frame. Muons decay with the Michel spectrum (L. Michel, 1950), and a stopped negative pion is captured with the Panofsky ratio. Vertices conserve charge, baryon number and strangeness.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
