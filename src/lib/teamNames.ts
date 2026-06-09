/**
 * 国家队 英文名 → 中文名 + 国旗 emoji 映射。
 * - 作为 onboarding 选主队、UI 展示的中文来源。
 * - refresh-odds cron 用它来给从 the-odds-api 新建的球队补中文名/国旗。
 * key 用小写英文名，尽量匹配 the-odds-api 返回的 home_team / away_team 写法。
 */
export const TEAM_NAMES: Record<string, { zh: string; flag: string }> = {
  // 东道主
  usa: { zh: "美国", flag: "🇺🇸" },
  "united states": { zh: "美国", flag: "🇺🇸" },
  canada: { zh: "加拿大", flag: "🇨🇦" },
  mexico: { zh: "墨西哥", flag: "🇲🇽" },
  // 南美
  argentina: { zh: "阿根廷", flag: "🇦🇷" },
  brazil: { zh: "巴西", flag: "🇧🇷" },
  uruguay: { zh: "乌拉圭", flag: "🇺🇾" },
  colombia: { zh: "哥伦比亚", flag: "🇨🇴" },
  ecuador: { zh: "厄瓜多尔", flag: "🇪🇨" },
  paraguay: { zh: "巴拉圭", flag: "🇵🇾" },
  peru: { zh: "秘鲁", flag: "🇵🇪" },
  chile: { zh: "智利", flag: "🇨🇱" },
  // 欧洲
  france: { zh: "法国", flag: "🇫🇷" },
  england: { zh: "英格兰", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  spain: { zh: "西班牙", flag: "🇪🇸" },
  portugal: { zh: "葡萄牙", flag: "🇵🇹" },
  germany: { zh: "德国", flag: "🇩🇪" },
  netherlands: { zh: "荷兰", flag: "🇳🇱" },
  italy: { zh: "意大利", flag: "🇮🇹" },
  belgium: { zh: "比利时", flag: "🇧🇪" },
  croatia: { zh: "克罗地亚", flag: "🇭🇷" },
  switzerland: { zh: "瑞士", flag: "🇨🇭" },
  denmark: { zh: "丹麦", flag: "🇩🇰" },
  poland: { zh: "波兰", flag: "🇵🇱" },
  serbia: { zh: "塞尔维亚", flag: "🇷🇸" },
  austria: { zh: "奥地利", flag: "🇦🇹" },
  "czech republic": { zh: "捷克", flag: "🇨🇿" },
  turkey: { zh: "土耳其", flag: "🇹🇷" },
  ukraine: { zh: "乌克兰", flag: "🇺🇦" },
  scotland: { zh: "苏格兰", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿" },
  wales: { zh: "威尔士", flag: "🏴󠁧󠁢󠁷󠁬󠁳󠁿" },
  norway: { zh: "挪威", flag: "🇳🇴" },
  sweden: { zh: "瑞典", flag: "🇸🇪" },
  greece: { zh: "希腊", flag: "🇬🇷" },
  // 非洲
  morocco: { zh: "摩洛哥", flag: "🇲🇦" },
  senegal: { zh: "塞内加尔", flag: "🇸🇳" },
  ghana: { zh: "加纳", flag: "🇬🇭" },
  nigeria: { zh: "尼日利亚", flag: "🇳🇬" },
  egypt: { zh: "埃及", flag: "🇪🇬" },
  cameroon: { zh: "喀麦隆", flag: "🇨🇲" },
  "ivory coast": { zh: "科特迪瓦", flag: "🇨🇮" },
  tunisia: { zh: "突尼斯", flag: "🇹🇳" },
  algeria: { zh: "阿尔及利亚", flag: "🇩🇿" },
  mali: { zh: "马里", flag: "🇲🇱" },
  "south africa": { zh: "南非", flag: "🇿🇦" },
  // 亚洲 / 大洋洲
  japan: { zh: "日本", flag: "🇯🇵" },
  "south korea": { zh: "韩国", flag: "🇰🇷" },
  iran: { zh: "伊朗", flag: "🇮🇷" },
  "saudi arabia": { zh: "沙特阿拉伯", flag: "🇸🇦" },
  qatar: { zh: "卡塔尔", flag: "🇶🇦" },
  australia: { zh: "澳大利亚", flag: "🇦🇺" },
  "new zealand": { zh: "新西兰", flag: "🇳🇿" },
  uzbekistan: { zh: "乌兹别克斯坦", flag: "🇺🇿" },
  jordan: { zh: "约旦", flag: "🇯🇴" },
  iraq: { zh: "伊拉克", flag: "🇮🇶" },
  // 中北美 / 加勒比
  "costa rica": { zh: "哥斯达黎加", flag: "🇨🇷" },
  panama: { zh: "巴拿马", flag: "🇵🇦" },
  honduras: { zh: "洪都拉斯", flag: "🇭🇳" },
  jamaica: { zh: "牙买加", flag: "🇯🇲" },
  haiti: { zh: "海地", flag: "🇭🇹" },
  "curaçao": { zh: "库拉索", flag: "🇨🇼" },
  curacao: { zh: "库拉索", flag: "🇨🇼" },
  // 其它参赛队
  "bosnia & herzegovina": { zh: "波黑", flag: "🇧🇦" },
  "bosnia and herzegovina": { zh: "波黑", flag: "🇧🇦" },
  "cape verde": { zh: "佛得角", flag: "🇨🇻" },
  "dr congo": { zh: "刚果(金)", flag: "🇨🇩" },
  "democratic republic of the congo": { zh: "刚果(金)", flag: "🇨🇩" },
};

/** 查中文名+国旗；查不到则回退到原英文名、用 ⚽ 占位。 */
export function lookupTeam(nameEn: string): { zh: string; flag: string } {
  return TEAM_NAMES[nameEn.trim().toLowerCase()] ?? { zh: nameEn, flag: "⚽" };
}
