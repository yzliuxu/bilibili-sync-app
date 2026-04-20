/**
 * 函数 1: 判断输入是否是 Netscape 格式的 Cookie
 * @param {string} rawCookie - 用户输入的文本
 * @returns {string|null} - 如果是 Netscape 格式则原样返回，否则返回 null
 */
export const validateNetscapeCookie = (rawCookie) => {
  if (!rawCookie || typeof rawCookie !== "string") return null;

  // 1. 快捷检查：如果包含标准的文件头，直接判定为有效并原样返回
  if (rawCookie.includes("# Netscape HTTP Cookie File")) {
    return rawCookie;
  }

  // 2. 深度检查：防止用户只复制了数据行（没有带表头）
  const lines = rawCookie.split("\n");

  for (let line of lines) {
    line = line.trim();
    if (!line) continue; // 忽略空行

    // 忽略普通注释，但放行 #HttpOnly_ 开头的有效数据行
    if (line.startsWith("#") && !line.startsWith("#HttpOnly_")) {
      continue;
    }

    // Netscape 严格使用制表符 (\t) 分隔
    const parts = line.split("\t");

    // 检查是否具备 7 列数据的强特征
    if (parts.length >= 7) {
      const includeSubdomains = parts[1].toUpperCase();
      const isSecure = parts[3].toUpperCase();
      const expiration = parts[4];

      const hasValidBooleans =
        (includeSubdomains === "TRUE" || includeSubdomains === "FALSE") &&
        (isSecure === "TRUE" || isSecure === "FALSE");
      const hasValidTimestamp = !isNaN(Number(expiration));

      // 只要有一行符合特征，即判定为有效并原样返回
      if (hasValidBooleans && hasValidTimestamp) {
        return rawCookie;
      }
    }
  }

  return null;
};
/**
 * 函数 2: 将输入转为 115 节点配置
 * @param {string} rawCookie - 用户输入的文本 (可能已经是配置，也可能是杂乱的 Cookie)
 * @returns {string|null} - Rclone 配置文件字符串，或 null
 */
export const formatRcloneConfig = (rawCookie) => {
  if (!rawCookie || typeof rawCookie !== "string") return null;

  const trimmedCookie = rawCookie.trim();

  // 1. 幂等性防御：如果已经是合法的 115 配置文件，直接原样返回
  // 检查是否以 [115] 开头，并且包含了至少两个核心鉴权字段
  if (
    trimmedCookie.startsWith("[115]") &&
    /uid\s*=/i.test(trimmedCookie) &&
    /cid\s*=/i.test(trimmedCookie)
  ) {
    return rawCookie; // 原样返回，保留用户可能的自定义空格或注释
  }

  // 2. 提取器：通吃带等号的格式和带空白符的格式
  const extract = (key) => {
    // 匹配 "KEY=VALUE" 或 "KEY = VALUE" (Header 格式)
    const eqRegex = new RegExp(`\\b${key}\\s*=\\s*([^;\\s]+)`, "i");
    const eqMatch = rawCookie.match(eqRegex);
    if (eqMatch) return eqMatch[1];

    // 匹配 "KEY   VALUE" (Netscape 格式)
    const spaceRegex = new RegExp(`\\b${key}\\s+([^=\\s;]+)`, "i");
    const spaceMatch = rawCookie.match(spaceRegex);
    if (spaceMatch) return spaceMatch[1];

    return "";
  };

  const uid = extract("UID");
  const cid = extract("CID");
  const seid = extract("SEID");
  const kid = extract("KID");

  // 3. 强校验：115 网盘的鉴权依赖这 4 个参数，缺一不可
  if (!uid || !cid || !seid || !kid) {
    return null;
  }

  // 4. 拼装并返回标准的 Rclone 格式
  return `[115]
type = 115
uid = ${uid}
cid = ${cid}
seid = ${seid}
kid = ${kid}`;
};
