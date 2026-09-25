'use strict';

function firstPositive(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 0;
}

function hasFlag(...values) {
  return values.some((value) => value === true || Number(value) === 1 || /^(?:true|yes)$/i.test(String(value || '')));
}

function allowedUrls(address, allowUrl) {
  const urls = address?.url_list || address?.urlList || [];
  return Array.isArray(urls) ? urls.filter((url) => typeof url === 'string' && allowUrl(url)) : [];
}

function resolutionHeight(rate, address, video) {
  const explicit = firstPositive(rate.height, rate.video_height, rate.videoHeight, address.height, address.video_height, address.videoHeight);
  if (explicit) return explicit;
  const labels = [rate.gear_name, rate.gearName, rate.quality_desc, rate.qualityDesc, rate.resolution].filter(Boolean).join(' ');
  const named = [...labels.matchAll(/(\d{3,4})\s*p/ig)].map((match) => Number(match[1])).filter((value) => value > 0);
  if (named.length) return Math.max(...named);
  return firstPositive(video.height, video.video_height, video.videoHeight);
}

function codecRank(rate, address) {
  const name = [rate.codec_type, rate.codecType, rate.codec, address.codec_type, address.codecType].filter(Boolean).join(' ').toLowerCase();
  if (/h264|h\.264|avc/.test(name)) return 3;
  if (/h265|h\.265|hevc/.test(name) || hasFlag(rate.is_h265, rate.isH265)) return 2;
  if (/bytevc1/.test(name) || hasFlag(rate.is_bytevc1, rate.isBytevc1)) return 1;
  return 2;
}

// 抖音播放地址去水印并尽量拉到 1080p：playwm 是有水印端点，play 是无水印端点；
// ratio 参数控制清晰度档位，原档低于 1080p 时请求 1080p。
function upgradeDouyinUrl(url) {
  if (!url || typeof url !== 'string') return url;
  let upgraded = String(url).replace(/playwm/gi, 'play');
  try {
    const parsed = new URL(upgraded);
    const ratio = parsed.searchParams.get('ratio') || '';
    if (!/^(1080|1440|2160|4k)/i.test(ratio)) {
      parsed.searchParams.set('ratio', '1080p');
      upgraded = parsed.toString();
    }
  } catch {
    upgraded = upgraded.replace(/ratio=[^&]*/i, 'ratio=1080p');
  }
  return upgraded;
}

function chooseHighestMp4(item, allowUrl) {
  const video = item?.video || {};
  const rates = video.bit_rate || video.bitRate || [];
  const candidates = (Array.isArray(rates) ? rates : []).map((rate) => {
    const address = rate.play_addr || rate.playAddr || {};
    const format = String(rate.format || address.format || '').toLowerCase();
    const urls = allowedUrls(address, allowUrl);
    const width = firstPositive(rate.width, rate.video_width, rate.videoWidth, address.width, address.video_width, address.videoWidth);
    const height = resolutionHeight(rate, address, video);
    return {
      urls,
      format,
      pixels: width && height ? width * height : height * height,
      height,
      bitrate: firstPositive(rate.bit_rate, rate.bitRate),
      qualityType: firstPositive(rate.quality_type, rate.qualityType),
      codec: codecRank(rate, address),
    };
  }).filter((candidate) => candidate.urls.length && candidate.format === 'mp4');

  candidates.sort((a, b) => b.pixels - a.pixels
    || b.height - a.height
    || b.bitrate - a.bitrate
    || b.codec - a.codec
    || b.qualityType - a.qualityType);
  if (candidates.length) return upgradeDouyinUrl(candidates[0].urls[0]);

  return upgradeDouyinUrl(allowedUrls(video.play_addr || video.playAddr, allowUrl)[0] || '');
}

module.exports = { chooseHighestMp4 };
