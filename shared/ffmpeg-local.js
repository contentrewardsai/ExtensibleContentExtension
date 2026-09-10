/**
 * Local FFmpeg WASM wrapper.
 * Lazy-loads @ffmpeg/ffmpeg UMD + @ffmpeg/core WASM from lib/ffmpeg/
 * and exposes window.FFmpegLocal for in-browser WebM-to-MP4 conversion.
 */
(function (global) {
  'use strict';

  var ffmpegInstance = null;
  var loading = null;

  function coreURL() {
    return chrome.runtime.getURL('lib/ffmpeg/ffmpeg-core.js');
  }
  function wasmURL() {
    return chrome.runtime.getURL('lib/ffmpeg/ffmpeg-core.wasm');
  }

  function ensureLoaded(report) {
    if (ffmpegInstance && ffmpegInstance.loaded) return Promise.resolve(ffmpegInstance);
    if (loading) return loading;

    loading = (function () {
      var FFmpegClass = global.FFmpegWASM && global.FFmpegWASM.FFmpeg;
      if (!FFmpegClass) {
        return Promise.reject(new Error('FFmpegWASM.FFmpeg not found – is lib/ffmpeg/ffmpeg.js loaded?'));
      }
      ffmpegInstance = new FFmpegClass();

      /**
       * ffmpeg.wasm progress payloads are supposed to use progress in [0, 1]; some ffmpeg-core
       * builds emit signed or time-like values. Never multiply bogus numbers by 100 for UI.
       */
      function ffmpegProgressToPercent(ev) {
        if (!ev || typeof ev !== 'object') return null;
        var r = ev.progress;
        if (typeof r !== 'number' || !isFinite(r)) {
          r = ev.ratio;
        }
        if (typeof r !== 'number' || !isFinite(r)) return null;
        if (r >= 0 && r <= 1) return Math.max(0, Math.min(100, Math.round(r * 100)));
        if (r > 1 && r <= 100) return Math.round(r);
        return null;
      }

      ffmpegInstance.on('progress', function (ev) {
        if (typeof report === 'function') {
          var pct = ffmpegProgressToPercent(ev);
          if (pct != null) {
            report('Converting... ' + pct + '%');
          } else {
            report('Converting...');
          }
        }
      });

      return ffmpegInstance.load({
        coreURL: coreURL(),
        wasmURL: wasmURL(),
      }).then(function () {
        return ffmpegInstance;
      });
    })();

    loading.catch(function () {
      ffmpegInstance = null;
      loading = null;
    });

    return loading;
  }

  /**
   * Convert a video/audio Blob to MP4 locally via FFmpeg WASM.
   * @param {Blob} blob - Input media blob (e.g. video/webm).
   * @param {function} [onProgress] - Optional callback receiving status strings.
   * @returns {Promise<{ok:boolean, blob?:Blob, error?:string}>}
   */
  function convertToMp4(blob, onProgress) {
    var report = typeof onProgress === 'function' ? onProgress : function () {};

    report('Loading FFmpeg WASM...');

    return ensureLoaded(report)
      .then(function (ff) {
        return blob.arrayBuffer().then(function (buf) {
          var inputName = 'input.webm';
          var outputName = 'output.mp4';
          report('Writing input file...');
          return ff.writeFile(inputName, new Uint8Array(buf))
            .then(function () {
              report('Converting to MP4...');
              return ff.exec([
                '-i', inputName,
                '-c:v', 'libx264',
                '-preset', 'medium',
                '-crf', '23',
                '-pix_fmt', 'yuv420p',
                '-c:a', 'aac',
                '-b:a', '128k',
                outputName,
              ]);
            })
            .then(function () {
              report('Reading output...');
              return ff.readFile(outputName);
            })
            .then(function (data) {
              var mp4Blob = new Blob([data], { type: 'video/mp4' });
              ff.deleteFile(inputName).catch(function () {});
              ff.deleteFile(outputName).catch(function () {});
              report('Conversion complete.');
              return { ok: true, blob: mp4Blob };
            });
        });
      })
      .catch(function (err) {
        var msg = err && err.message ? err.message : String(err);
        return { ok: false, error: msg };
      });
  }

  /**
   * Convert a WAV/WebM audio Blob to M4A (MP4 audio) locally.
   */
  function convertToM4a(blob, onProgress) {
    var report = typeof onProgress === 'function' ? onProgress : function () {};

    report('Loading FFmpeg WASM...');

    return ensureLoaded(report)
      .then(function (ff) {
        return blob.arrayBuffer().then(function (buf) {
          var ext = (blob.type || '').indexOf('wav') >= 0 ? 'wav' : 'webm';
          var inputName = 'input.' + ext;
          var outputName = 'output.m4a';
          report('Writing input file...');
          return ff.writeFile(inputName, new Uint8Array(buf))
            .then(function () {
              report('Converting to M4A...');
              return ff.exec([
                '-i', inputName,
                '-vn',
                '-c:a', 'aac',
                '-b:a', '192k',
                outputName,
              ]);
            })
            .then(function () {
              report('Reading output...');
              return ff.readFile(outputName);
            })
            .then(function (data) {
              var m4aBlob = new Blob([data], { type: 'audio/mp4' });
              ff.deleteFile(inputName).catch(function () {});
              ff.deleteFile(outputName).catch(function () {});
              report('Conversion complete.');
              return { ok: true, blob: m4aBlob };
            });
        });
      })
      .catch(function (err) {
        var msg = err && err.message ? err.message : String(err);
        return { ok: false, error: msg };
      });
  }

  /**
   * Best-effort duration in seconds from media blob (parses ffmpeg -i log line).
   * @returns {Promise<number>} 0 if unknown
   */
  function probeDurationSeconds(blob, onProgress) {
    var report = typeof onProgress === 'function' ? onProgress : function () {};
    return ensureLoaded(report)
      .then(function (ff) {
        return blob.arrayBuffer().then(function (buf) {
          var inputName = 'probe_in.webm';
          if ((blob.type || '').indexOf('mp4') >= 0) inputName = 'probe_in.mp4';
          else if ((blob.type || '').indexOf('wav') >= 0) inputName = 'probe_in.wav';
          var duration = 0;
          function onLog(ev) {
            var msg = (ev && ev.message) ? String(ev.message) : '';
            var m = /Duration:\s*(\d{2}):(\d{2}):([\d.]+)/.exec(msg);
            if (m) {
              duration = parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3]);
            }
          }
          ff.on('log', onLog);
          return ff.writeFile(inputName, new Uint8Array(buf))
            .then(function () {
              return ff.exec(['-i', inputName]).catch(function () { return null; });
            })
            .then(function () {
              ff.off('log', onLog);
              ff.deleteFile(inputName).catch(function () {});
              return duration;
            });
        });
      })
      .catch(function () {
        return 0;
      });
  }

  /**
   * Extract [startSec, startSec+durationSec) into a new MP4 (video+audio) or M4A (audio-only).
   * @param {Blob} blob
   * @param {number} startSec
   * @param {number} durationSec
   * @param {{ mode?: 'video'|'audio', includeAudio?: boolean, onProgress?: function }} opts
   *   includeAudio: for mode video, false = video-only MP4 (no audio track). Default true.
   */
  function extractSegment(blob, startSec, durationSec, opts) {
    opts = opts || {};
    var mode = opts.mode === 'audio' ? 'audio' : 'video';
    var includeAudio = opts.includeAudio !== false;
    var report = typeof opts.onProgress === 'function' ? opts.onProgress : function () {};
    var inName = 'ext_in.webm';
    var bt = (blob.type || '').toLowerCase();
    var bn = (typeof blob.name === 'string' ? blob.name : '').toLowerCase();
    if (bt.indexOf('mp4') >= 0 || bt.indexOf('m4a') >= 0 || bt.indexOf('audio/mp4') >= 0) inName = 'ext_in.mp4';
    else if (bt.indexOf('audio/') === 0) inName = 'ext_in.mp4';
    else if (bn.endsWith('.m4a') || bn.endsWith('.mp4')) inName = 'ext_in.mp4';
    var outName = mode === 'audio' ? 'ext_out.m4a' : 'ext_out.mp4';

    function headArgs(beforeInput) {
      return beforeInput
        ? ['-ss', String(startSec), '-i', inName, '-t', String(durationSec)]
        : ['-i', inName, '-ss', String(startSec), '-t', String(durationSec)];
    }

    function videoArgs(beforeInput, withAudio, mapVideo) {
      var a = headArgs(beforeInput).slice();
      if (mapVideo && !withAudio) {
        a.push('-map', '0:v:0');
      }
      a.push(
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        '28',
        '-pix_fmt',
        'yuv420p'
      );
      if (withAudio) {
        a.push('-c:a', 'aac', '-b:a', '128k');
      } else {
        a.push('-an');
      }
      a.push(outName);
      return a;
    }

    function audioArgs(beforeInput) {
      return headArgs(beforeInput).concat([
        '-vn',
        '-c:a', 'aac',
        '-b:a', '128k',
        outName,
      ]);
    }

    return ensureLoaded(report)
      .then(function (ff) {
        return blob.arrayBuffer().then(function (buf) {
          report('Writing segment input...');
          return ff.writeFile(inName, new Uint8Array(buf))
            .then(function () {
              report('Extracting segment...');
              if (mode === 'audio') {
                return ff
                  .exec(audioArgs(true))
                  .catch(function () {
                    return ff.exec(audioArgs(false));
                  });
              }
              if (!includeAudio) {
                return ff
                  .exec(videoArgs(true, false, true))
                  .catch(function () {
                    return ff.exec(videoArgs(true, false, false));
                  })
                  .catch(function () {
                    return ff.exec(videoArgs(false, false, true));
                  })
                  .catch(function () {
                    return ff.exec(videoArgs(false, false, false));
                  });
              }
              return ff
                .exec(videoArgs(true, true, false))
                .catch(function () {
                  return ff.exec(videoArgs(true, false, false));
                })
                .catch(function () {
                  return ff.exec(videoArgs(false, true, false));
                })
                .catch(function () {
                  return ff.exec(videoArgs(false, false, false));
                });
            })
            .then(function () {
              return ff.readFile(outName);
            })
            .then(function (data) {
              var mime = mode === 'audio' ? 'audio/mp4' : 'video/mp4';
              var outBlob = new Blob([data], { type: mime });
              ff.deleteFile(inName).catch(function () {});
              ff.deleteFile(outName).catch(function () {});
              report('Segment done.');
              return { ok: true, blob: outBlob, mimeType: mime };
            });
        });
      })
      .catch(function (err) {
        var msg = err && err.message ? err.message : String(err);
        return { ok: false, error: msg };
      });
  }

  function videoInputName(blob) {
    var bt = (blob && blob.type || '').toLowerCase();
    var bn = (typeof blob.name === 'string' ? blob.name : '').toLowerCase();
    if (bt.indexOf('mp4') >= 0 || bn.endsWith('.mp4') || bn.endsWith('.m4v')) return 'in_vid.mp4';
    if (bt.indexOf('quicktime') >= 0 || bn.endsWith('.mov')) return 'in_vid.mov';
    if (bt.indexOf('matroska') >= 0 || bn.endsWith('.mkv')) return 'in_vid.mkv';
    return 'in_vid.webm';
  }

  function workerFsType() {
    var t = global.FFmpegWASM && global.FFmpegWASM.FFFSType;
    return (t && t.WORKERFS) || 'WORKERFS';
  }

  /**
   * Strip video container to AAC/M4A audio (for transcription pipelines).
   * Mounts the Blob via WORKERFS so the WASM worker never receives a >64MiB
   * writeFile payload (Chrome extension IPC cap).
   * @param {Blob} blob - video blob (webm, mp4, mov, etc.)
   * @param {function} [onProgress]
   * @returns {Promise<{ok:boolean, blob?:Blob, error?:string}>}
   */
  function extractAudioFromVideo(blob, onProgress) {
    var report = typeof onProgress === 'function' ? onProgress : function () {};
    var inName = videoInputName(blob);
    var outName = 'out_aud.m4a';
    var mountPoint = '/cfs_vid';
    var WRITEFILE_MAX = 48 * 1024 * 1024;

    function remapProgress(msg) {
      if (typeof msg === 'string' && msg.indexOf('Converting') === 0) {
        report('Extracting audio with FFmpeg…');
      } else {
        report(msg || 'Extracting audio with FFmpeg…');
      }
    }

    function extractMounted(ff) {
      report('Extracting audio with FFmpeg…');
      return ff.createDir(mountPoint).catch(function () { return null; }).then(function () {
        return ff.mount(workerFsType(), { blobs: [{ name: inName, data: blob }] }, mountPoint);
      }).then(function () {
        return ff.exec(['-i', mountPoint + '/' + inName, '-vn', '-c:a', 'aac', '-b:a', '128k', outName]);
      }).then(function () {
        return ff.readFile(outName);
      }).then(function (data) {
        var outBlob = new Blob([data], { type: 'audio/mp4' });
        ff.deleteFile(outName).catch(function () {});
        report('Audio extract done.');
        return { ok: true, blob: outBlob };
      }).finally(function () {
        return ff.unmount(mountPoint).catch(function () {});
      });
    }

    function extractWriteFile(ff) {
      report('Extracting audio with FFmpeg…');
      return blob.arrayBuffer().then(function (buf) {
        return ff.writeFile(inName, new Uint8Array(buf)).then(function () {
          return ff.exec(['-i', inName, '-vn', '-c:a', 'aac', '-b:a', '128k', outName]);
        }).then(function () {
          return ff.readFile(outName);
        }).then(function (data) {
          var outBlob = new Blob([data], { type: 'audio/mp4' });
          ff.deleteFile(inName).catch(function () {});
          ff.deleteFile(outName).catch(function () {});
          report('Audio extract done.');
          return { ok: true, blob: outBlob };
        });
      });
    }

    function extractViaElement() {
      if (typeof document === 'undefined' || typeof MediaRecorder === 'undefined') {
        return Promise.reject(new Error('Browser audio extract is not available'));
      }
      report('Extracting audio (browser decoder)…');
      return new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(blob);
        var video = document.createElement('video');
        video.preload = 'auto';
        video.muted = true;
        video.playsInline = true;
        video.src = url;
        var done = false;
        function cleanup() {
          if (done) return;
          done = true;
          try { video.pause(); } catch (_) {}
          video.removeAttribute('src');
          try { video.load(); } catch (_) {}
          URL.revokeObjectURL(url);
        }
        video.onerror = function () {
          cleanup();
          reject(new Error('Could not decode video'));
        };
        video.onloadedmetadata = function () {
          var cap = typeof video.captureStream === 'function'
            ? video.captureStream()
            : (typeof video.mozCaptureStream === 'function' ? video.mozCaptureStream() : null);
          if (!cap || !cap.getAudioTracks || !cap.getAudioTracks().length) {
            cleanup();
            reject(new Error('No audio track in this video'));
            return;
          }
          var mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');
          if (!mime) {
            cleanup();
            reject(new Error('MediaRecorder is not available'));
            return;
          }
          var rec = new MediaRecorder(new MediaStream(cap.getAudioTracks()), {
            mimeType: mime,
            audioBitsPerSecond: 128000
          });
          var chunks = [];
          rec.ondataavailable = function (ev) {
            if (ev.data && ev.data.size) chunks.push(ev.data);
          };
          rec.onerror = function () {
            cleanup();
            reject(new Error('Audio capture failed'));
          };
          rec.onstop = function () {
            cleanup();
            resolve(new Blob(chunks, { type: 'audio/webm' }));
          };
          rec.start(1000);
          try { video.playbackRate = 8; } catch (_) {}
          var playP = video.play();
          if (playP && playP.catch) playP.catch(function () {});
          video.onended = function () {
            try { rec.stop(); } catch (_) {}
          };
        };
      }).then(function (outBlob) {
        report('Audio extract done.');
        return { ok: true, blob: outBlob };
      });
    }

    return ensureLoaded(remapProgress)
      .then(function (ff) {
        return extractMounted(ff).catch(function (err) {
          var m = err && err.message ? err.message : String(err);
          if (blob.size > WRITEFILE_MAX || /64\s*MiB|maximum allowed size/i.test(m)) {
            throw err;
          }
          return extractWriteFile(ff);
        });
      })
      .catch(function (err) {
        return extractViaElement().catch(function () {
          var m = err && err.message ? err.message : String(err);
          return { ok: false, error: m };
        });
      });
  }

  /**
   * Cut a video/audio Blob into AAC/M4A chunks (default 60s) via a single WORKERFS mount.
   * @returns {Promise<{ok:boolean, blobs?:{blob:Blob,start:number,duration:number,index:number}[], duration?:number, error?:string}>}
   */
  function extractAudioChunks(blob, opts) {
    opts = opts || {};
    var chunkSec = typeof opts.chunkSeconds === 'number' && opts.chunkSeconds > 5 ? opts.chunkSeconds : 60;
    var report = typeof opts.onProgress === 'function' ? opts.onProgress : function () {};
    var inName = videoInputName(blob);
    var bt = (blob && blob.type || '').toLowerCase();
    var bn = (typeof blob.name === 'string' ? blob.name : '').toLowerCase();
    if (bt.indexOf('audio/') === 0 || /\.(mp3|m4a|aac|wav|ogg|flac|opus)$/.test(bn)) {
      if (bn.endsWith('.mp3') || bt.indexOf('mpeg') >= 0) inName = 'in_aud.mp3';
      else if (bn.endsWith('.wav') || bt.indexOf('wav') >= 0) inName = 'in_aud.wav';
      else inName = 'in_aud.m4a';
    }
    var mountPoint = '/cfs_chk';
    var inputPath = mountPoint + '/' + inName;

    function probeMountedDuration(ff) {
      var duration = 0;
      function onLog(ev) {
        var msg = ev && ev.message ? String(ev.message) : '';
        var m = /Duration:\s*(\d{2}):(\d{2}):([\d.]+)/.exec(msg);
        if (m) {
          duration = parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3]);
        }
      }
      ff.on('log', onLog);
      return ff.exec(['-i', inputPath]).catch(function () { return null; }).then(function () {
        ff.off('log', onLog);
        return duration;
      });
    }

    function pullChunks(ff, duration) {
      var blobs = [];
      var start = 0;
      var i = 0;
      var total = Math.max(1, Math.ceil(duration / chunkSec));
      function next() {
        if (start >= duration - 0.05) return Promise.resolve(blobs);
        var len = Math.min(chunkSec, duration - start);
        if (len < 0.4 && blobs.length) return Promise.resolve(blobs);
        var out = 'chk_' + i + '.m4a';
        var idx = i + 1;
        var ss = start;
        i += 1;
        start += chunkSec;
        report('Extracting audio chunk ' + idx + '/' + total + '…');
        return ff.exec([
          '-ss', String(ss),
          '-i', inputPath,
          '-t', String(len),
          '-vn', '-c:a', 'aac', '-b:a', '128k',
          '-y', out
        ]).then(function () {
          return ff.readFile(out);
        }).then(function (data) {
          blobs.push({
            blob: new Blob([data], { type: 'audio/mp4' }),
            start: ss,
            duration: len,
            index: idx
          });
          return ff.deleteFile(out).catch(function () {});
        }).then(next);
      }
      return next();
    }

    return ensureLoaded(function (msg) {
      report(msg && String(msg).indexOf('Converting') === 0 ? 'Extracting audio with FFmpeg…' : (msg || 'Loading FFmpeg…'));
    }).then(function (ff) {
      report('Extracting audio with FFmpeg…');
      return ff.createDir(mountPoint).catch(function () { return null; }).then(function () {
        return ff.mount(workerFsType(), { blobs: [{ name: inName, data: blob }] }, mountPoint);
      }).then(function () {
        return probeMountedDuration(ff);
      }).then(function (duration) {
        if (!(duration > 0.4)) {
          return ff.exec(['-i', inputPath, '-vn', '-c:a', 'aac', '-b:a', '128k', '-y', 'out_aud.m4a']).then(function () {
            return ff.readFile('out_aud.m4a');
          }).then(function (data) {
            ff.deleteFile('out_aud.m4a').catch(function () {});
            return {
              ok: true,
              duration: 0,
              blobs: [{ blob: new Blob([data], { type: 'audio/mp4' }), start: 0, duration: 0, index: 1 }]
            };
          });
        }
        return pullChunks(ff, duration).then(function (blobs) {
          if (!blobs.length) throw new Error('No audio chunks');
          report('Audio extract done (' + blobs.length + ' chunk' + (blobs.length === 1 ? '' : 's') + ').');
          return { ok: true, duration: duration, blobs: blobs };
        });
      }).finally(function () {
        return ff.unmount(mountPoint).catch(function () {});
      });
    }).catch(function (err) {
      return { ok: false, error: (err && err.message) ? err.message : String(err) };
    });
  }

  global.FFmpegLocal = {
    convertToM4a: convertToM4a,
    probeDurationSeconds: probeDurationSeconds,
    extractSegment: extractSegment,
    extractAudioFromVideo: extractAudioFromVideo,
    extractAudioChunks: extractAudioChunks,
  };
})(typeof window !== 'undefined' ? window : self);
