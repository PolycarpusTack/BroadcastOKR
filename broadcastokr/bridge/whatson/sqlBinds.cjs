const { scanSql } = require('./sqlEnvelope.cjs');

/** Convert named binds only in SQL code, preserving literals, comments and casts. */
function convertBinds(sql, binds) {
  const { protectedRanges } = scanSql(sql);
  const values = [];
  let range = 0;
  const text = sql.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (match, name, offset) => {
    while (range < protectedRanges.length && protectedRanges[range][1] <= offset) range++;
    if (sql[offset - 1] === ':' || (protectedRanges[range] && protectedRanges[range][0] <= offset)) return match;
    if (!Object.hasOwn(binds, name)) return match;
    values.push(binds[name]);
    return `$${values.length}`;
  });
  return { text, values };
}

module.exports = { convertBinds };
