# Zopfli browser compressor

Upstream: https://github.com/gfx/universal-zopfli-js, package `@gfx/zopfli@1.0.15`.

Registry tarball: https://registry.npmjs.org/@gfx/zopfli/-/zopfli-1.0.15.tgz

Tarball SHA-256: `57f5edd9ae3ad12a3c3b16ff3f7bd029b9348554f015d53b383655f048d3f3f9`.

Copyright 2017 FUJI Goro (gfx). The statically linked Google Zopfli and this binding are Apache-2.0 licensed; see LICENSE.md.

Browser adaptation: replace the two initial CommonJS imports with a local Base64 decoder and the exact packaged WASM string; expose the Emscripten Module as self.ZopfliModule. It runs only in the local share compression worker. All other generated runtime code is unchanged.
