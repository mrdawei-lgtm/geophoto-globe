import tzLookup from "@photostructure/tz-lookup";
import { DateTime } from "luxon";
import { narrativeApiBaseUrl, narrativeApiKey, narrativeModel } from "../config.js";
import type { PhotoRecord } from "../types.js";

type LocationNarrativeContext = {
  latitude: number;
  longitude: number;
  locationLabel: string;
  geoSummaryEn: string;
  photoCount: number;
  timeZone: string;
  captureRangeText: string;
  yearHintText: string;
  seasonHintText: string;
  timeOfDayHintText: string;
  consistencyText: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?:
        | string
        | Array<{
            type?: string;
            text?: string;
          }>;
    };
  }>;
};

export type LocationNarrativeGenerationResult = {
  status: "success" | "empty" | "error";
  description: string;
  rawCharacterCount: number;
  wasTruncated: boolean;
  finishReason: string | null;
  retriedFinalOnly: boolean;
  error: string | null;
};

type LocationNarrativeGenerator = {
  generate(context: LocationNarrativeContext): Promise<LocationNarrativeGenerationResult>;
};

function countCharacters(value: string) {
  return Array.from(value).length;
}

function truncateCharacters(value: string, maxLength: number) {
  return Array.from(value).slice(0, maxLength).join("");
}

function normalizeNarrative(value: string) {
  const normalized = value
    .replace(/<think>[\s\S]*?<\/think>/gi, " ")
    .replace(/\r/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^["“”'‘’\s]+|["“”'‘’\s]+$/g, "")
    .replace(/^(简介|介绍|文案)[:：]\s*/u, "")
    .trim();

  if (!normalized) {
    return {
      description: "",
      rawCharacterCount: 0,
      wasTruncated: false
    };
  }

  const rawCharacterCount = countCharacters(normalized);
  const wasTruncated = rawCharacterCount > 120;
  return {
    description: wasTruncated ? truncateCharacters(normalized, 120).trim() : normalized,
    rawCharacterCount,
    wasTruncated
  };
}

function chooseMostCommon(values: Array<string | null | undefined>) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized) {
      continue;
    }
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  let winner = "";
  let maxCount = 0;
  for (const [value, count] of counts) {
    if (count > maxCount) {
      winner = value;
      maxCount = count;
    }
  }
  return winner;
}

function monthToSeason(month: number) {
  if (month >= 3 && month <= 5) {
    return "春";
  }
  if (month >= 6 && month <= 8) {
    return "夏";
  }
  if (month >= 9 && month <= 11) {
    return "秋";
  }
  return "冬";
}

function hourToTimeOfDay(hour: number) {
  if (hour >= 5 && hour <= 7) {
    return "清晨";
  }
  if (hour >= 8 && hour <= 11) {
    return "上午";
  }
  if (hour >= 12 && hour <= 13) {
    return "正午";
  }
  if (hour >= 14 && hour <= 16) {
    return "午后";
  }
  if (hour >= 17 && hour <= 19) {
    return "傍晚";
  }
  return "夜间";
}

function describeValues(values: string[], emptyLabel: string) {
  if (!values.length) {
    return emptyLabel;
  }
  return values.join("、");
}

function resolveTimeZone(latitude: number, longitude: number) {
  try {
    return tzLookup(latitude, longitude);
  } catch {
    return "UTC";
  }
}

function formatLocalCaptureDate(dateTime: DateTime) {
  return dateTime.toFormat("yyyy-LL-dd");
}

function buildNarrativeContext(photos: PhotoRecord[]): LocationNarrativeContext | null {
  const withGeo = photos.filter(
    (photo): photo is PhotoRecord & { latitude: number; longitude: number } =>
      photo.latitude !== null && photo.longitude !== null
  );

  if (!withGeo.length) {
    return null;
  }

  const [anchor] = withGeo;
  const timeZone = resolveTimeZone(anchor.latitude, anchor.longitude);
  const timestamps = withGeo
    .map((photo) => {
      if (!photo.capturedAt) {
        return null;
      }
      const utc = DateTime.fromISO(photo.capturedAt, { zone: "utc" });
      if (!utc.isValid) {
        return null;
      }
      const local = utc.setZone(timeZone);
      return local.isValid ? local : null;
    })
    .filter((value): value is DateTime => Boolean(value))
    .sort((left, right) => left.toMillis() - right.toMillis());

  const years = Array.from(new Set(timestamps.map((value) => String(value.year))));
  const seasons = Array.from(new Set(timestamps.map((value) => monthToSeason(value.month))));
  const times = Array.from(new Set(timestamps.map((value) => hourToTimeOfDay(value.hour))));

  return {
    latitude: anchor.latitude,
    longitude: anchor.longitude,
    locationLabel: chooseMostCommon(withGeo.map((photo) => photo.locationLabel)),
    geoSummaryEn: chooseMostCommon(withGeo.map((photo) => photo.geoSummaryEn)),
    photoCount: withGeo.length,
    timeZone,
    captureRangeText:
      timestamps.length >= 2
        ? `${formatLocalCaptureDate(timestamps[0])} 至 ${formatLocalCaptureDate(timestamps[timestamps.length - 1])}`
        : timestamps.length === 1
          ? formatLocalCaptureDate(timestamps[0])
          : "未知",
    yearHintText: describeValues(years, "未知"),
    seasonHintText: describeValues(seasons, "未知"),
    timeOfDayHintText: describeValues(times, "未知"),
    consistencyText: [
      years.length <= 1 ? "年份基本一致" : "年份存在差异，请写共性版本",
      seasons.length <= 1 ? "季节基本一致" : "季节存在差异，请避免写死单一季节",
      times.length <= 1 ? "时段基本一致" : "时段存在差异，请避免写死单一钟点"
    ].join("；")
  };
}

function extractMessageContent(payload: ChatCompletionResponse) {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((item) => item.text ?? "")
    .join(" ")
    .trim();
}

function shouldRetryAfterResponse(payload: ChatCompletionResponse, text: string) {
  const finishReason = payload.choices?.[0]?.finish_reason ?? "";
  return !text && finishReason === "length";
}

class OpenAICompatibleNarrativeGenerator implements LocationNarrativeGenerator {
  private readonly configured =
    Boolean(narrativeApiBaseUrl) && Boolean(narrativeApiKey) && Boolean(narrativeModel);

  private async requestCompletion(context: LocationNarrativeContext, maxTokens: number, finalOnly: boolean) {
    const systemPrompt = finalOnly
      ? "你是照片地点简介写作者。只输出最终正文，不要输出思考过程，不要输出<think>标签。请以一个旅行者回望旅途现场的口吻写，照片内容都是作者本人对当时环境的捕捉。写中文、90字以内、中性自然、略带纪录片解说感。可以有趣，但不要浮夸，不要编造未提供的事实。所有时间线索都已经换算成拍摄地当地时间，但时间只作为理解场景的背景参考，不要默认写进正文；只有当年代、季节或时段对画面气质有明显决定作用时，才自然地点到为止。若年代、季节或时段线索不一致，请写不冲突的共性版本，或直接回避具体时间表达。不要编造主人公的行为、动作、停留、行走、寻找、坐下、回望等细节，只描述主人公对风景、建筑、光线、气味、声音，以及当地人生活痕迹的观察和感受。必要时可出现少量英文单词。不要标题，不要引号。"
      : "你是照片地点简介写作者。请以一个旅行者回望旅途现场的口吻写，照片内容都是作者本人对当时环境的捕捉。写中文、90字以内、中性自然、略带纪录片解说感。可以有趣，但不要浮夸，不要编造未提供的事实。所有时间线索都已经换算成拍摄地当地时间，但时间只作为理解场景的背景参考，不要默认写进正文；只有当年代、季节或时段对画面气质有明显决定作用时，才自然地点到为止。若年代、季节或时段线索不一致，请写不冲突的共性版本，或直接回避具体时间表达。不要编造主人公的行为、动作、停留、行走、寻找、坐下、回望等细节，只描述主人公对风景、建筑、光线、气味、声音，以及当地人生活痕迹的观察和感受。必要时可出现少量英文单词。只输出正文，不要标题，不要引号。";
    const endpoint = `${narrativeApiBaseUrl.replace(/\/+$/, "")}/chat/completions`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${narrativeApiKey}`
      },
      body: JSON.stringify({
        model: narrativeModel,
        temperature: 0.4,
        max_tokens: maxTokens,
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: [
              `地点标签: ${context.locationLabel || "未知"}`,
              `英文地理摘要: ${context.geoSummaryEn || "未知"}`,
              `坐标: ${context.latitude}, ${context.longitude}`,
              `照片数量: ${context.photoCount}`,
              `拍摄地时区: ${context.timeZone}`,
              `拍摄日期范围: ${context.captureRangeText}`,
              `年份线索: ${context.yearHintText}`,
              `季节线索: ${context.seasonHintText}`,
              `时段线索: ${context.timeOfDayHintText}`,
              `一致性提醒: ${context.consistencyText}`,
              "写作视角: 以旅行者的口吻，像作者对当时环境与气味、光线、动静，以及当地人生活痕迹的个人观察与感受。",
              "写作偏好: 时间只做背景参考，不要默认写入正文；如果不写时间，文案也要成立。",
              "人物约束: 不要编造作者做了什么，只写作者看见、听见、闻到、感受到什么。",
              "可选写法: 小知识、历史典故、古诗词、名人轶事、地理观察，但必须和地点及时间线索相容。"
            ].join("\n")
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Narrative generation failed with ${response.status}`);
    }

    return (await response.json()) as ChatCompletionResponse;
  }

  async generate(context: LocationNarrativeContext): Promise<LocationNarrativeGenerationResult> {
    if (!this.configured) {
      return {
        status: "empty",
        description: "",
        rawCharacterCount: 0,
        wasTruncated: false,
        finishReason: null,
        retriedFinalOnly: false,
        error: null
      };
    }

    const firstPayload = await this.requestCompletion(context, 700, false);
    const firstNormalized = normalizeNarrative(extractMessageContent(firstPayload));
    if (firstNormalized.description) {
      return {
        status: "success",
        description: firstNormalized.description,
        rawCharacterCount: firstNormalized.rawCharacterCount,
        wasTruncated: firstNormalized.wasTruncated,
        finishReason: firstPayload.choices?.[0]?.finish_reason ?? null,
        retriedFinalOnly: false,
        error: null
      };
    }

    if (!shouldRetryAfterResponse(firstPayload, firstNormalized.description)) {
      return {
        status: "empty",
        description: "",
        rawCharacterCount: firstNormalized.rawCharacterCount,
        wasTruncated: false,
        finishReason: firstPayload.choices?.[0]?.finish_reason ?? null,
        retriedFinalOnly: false,
        error: null
      };
    }

    const secondPayload = await this.requestCompletion(context, 700, true);
    const secondNormalized = normalizeNarrative(extractMessageContent(secondPayload));
    if (secondNormalized.description) {
      return {
        status: "success",
        description: secondNormalized.description,
        rawCharacterCount: secondNormalized.rawCharacterCount,
        wasTruncated: secondNormalized.wasTruncated,
        finishReason: secondPayload.choices?.[0]?.finish_reason ?? null,
        retriedFinalOnly: true,
        error: null
      };
    }

    return {
      status: "empty",
      description: "",
      rawCharacterCount: secondNormalized.rawCharacterCount,
      wasTruncated: false,
      finishReason: secondPayload.choices?.[0]?.finish_reason ?? null,
      retriedFinalOnly: true,
      error: null
    };
  }
}
export class LocationNarrativeService {
  constructor(private readonly generator: LocationNarrativeGenerator = new OpenAICompatibleNarrativeGenerator()) {}

  async generateDetailedForPhotos(photos: PhotoRecord[]): Promise<LocationNarrativeGenerationResult> {
    const context = buildNarrativeContext(photos);
    if (!context) {
      return {
        status: "empty",
        description: "",
        rawCharacterCount: 0,
        wasTruncated: false,
        finishReason: null,
        retriedFinalOnly: false,
        error: null
      };
    }

    try {
      return await this.generator.generate(context);
    } catch (error) {
      return {
        status: "error",
        description: "",
        rawCharacterCount: 0,
        wasTruncated: false,
        finishReason: null,
        retriedFinalOnly: false,
        error: error instanceof Error ? error.message : "Narrative generation failed"
      };
    }
  }

  async generateForPhotos(photos: PhotoRecord[]) {
    const result = await this.generateDetailedForPhotos(photos);
    return result.description;
  }
}
