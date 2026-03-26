/**
 * Social Media Distribution Utilities for BlogsPro
 */

function generateSocialCardText(title, category, complexity) {
    const border = "=".repeat(title.length + 4);
    return `
${border}
  ${category.toUpperCase()} | DEPTH: ${complexity}/10
${border}
  ${title}
${border}
Read more at blogspro.in
`;
}

module.exports = { generateSocialCardText };
