const copyByLanguage = {
  english: {
    templates: [
      (title) => `Explore ${title}. See the product details and decide if it fits your needs.`,
      (title, price) => `A clear look at ${title}${price ? `, priced at ${price}` : ''}.`,
      (title) => `Considering a gift? Take a closer look at ${title}.`,
      (_title, _price, description) => description ? `Product details: ${description}` : 'Explore the product details.',
      (title) => `Meet ${title} — explore the details before you choose.`,
      (title) => `A seasonal idea to consider: ${title}.`,
      (title) => `Make room for ${title}. Take a closer look.`,
      (title) => `New to you? Discover ${title} and its details.`,
      (title) => `See how ${title} could fit into your day.`,
      (title) => `Browse ${title} and find out more.`,
    ],
    cta: 'See details',
  },
  spanish: {
    templates: [
      (title) => `Descubre ${title}. Consulta los detalles y decide si se adapta a tus necesidades.`,
      (title, price) => `Conoce ${title}${price ? `, con un precio de ${price}` : ''}.`,
      (title) => `¿Buscas un regalo? Echa un vistazo a ${title}.`,
      (_title, _price, description) => description ? `Detalles del producto: ${description}` : 'Explora los detalles del producto.',
      (title) => `Te presentamos ${title}. Conoce sus detalles antes de elegir.`,
      (title) => `Una idea para esta temporada: ${title}.`,
      (title) => `Dale un espacio a ${title}. Descubre más.`,
      (title) => `¿Aún no lo conoces? Descubre ${title} y sus detalles.`,
      (title) => `Descubre cómo ${title} podría formar parte de tu día.`,
      (title) => `Explora ${title} y conoce más.`,
    ],
    cta: 'Ver detalles',
  },
  french: {
    templates: [
      (title) => `Découvrez ${title}. Consultez les détails et voyez s’il vous convient.`,
      (title, price) => `Découvrez ${title}${price ? `, au prix de ${price}` : ''}.`,
      (title) => `À la recherche d’un cadeau ? Découvrez ${title}.`,
      (_title, _price, description) => description ? `Détails du produit : ${description}` : 'Découvrez les détails du produit.',
      (title) => `Voici ${title}. Consultez les détails avant de choisir.`,
      (title) => `Une idée pour cette saison : ${title}.`,
      (title) => `Faites une place à ${title}. Découvrez-le de plus près.`,
      (title) => `Vous ne le connaissez pas encore ? Découvrez ${title}.`,
      (title) => `Découvrez comment ${title} pourrait s’intégrer à votre quotidien.`,
      (title) => `Parcourez ${title} et découvrez-en plus.`,
    ],
    cta: 'Voir les détails',
  },
  swahili: {
    templates: [
      (title) => `Gundua ${title}. Tazama maelezo ya bidhaa na uamue kama inakufaa.`,
      (title, price) => `Tazama ${title}${price ? `, kwa bei ya ${price}` : ''}.`,
      (title) => `Unatafuta zawadi? Ichunguze ${title}.`,
      (_title, _price, description) => description ? `Maelezo ya bidhaa: ${description}` : 'Tazama maelezo ya bidhaa.',
      (title) => `Fahamu ${title}. Angalia maelezo kabla ya kuchagua.`,
      (title) => `Wazo la msimu huu: ${title}.`,
      (title) => `Ipe ${title} nafasi. Ichunguze kwa karibu.`,
      (title) => `Hujawahi kuiona? Gundua ${title} na maelezo yake.`,
      (title) => `Tazama jinsi ${title} inavyoweza kufaa katika siku yako.`,
      (title) => `Vinjari ${title} upate maelezo zaidi.`,
    ],
    cta: 'Tazama maelezo',
  },
  arabic: {
    templates: [
      (title) => `اكتشف ${title}. اطّلع على تفاصيل المنتج وقرر ما إذا كان يناسب احتياجاتك.`,
      (title, price) => `تعرّف على ${title}${price ? `، بسعر ${price}` : ''}.`,
      (title) => `هل تبحث عن هدية؟ ألقِ نظرة على ${title}.`,
      (_title, _price, description) => description ? `تفاصيل المنتج: ${description}` : 'اطّلع على تفاصيل المنتج.',
      (title) => `تعرّف على ${title} واطّلع على التفاصيل قبل الاختيار.`,
      (title) => `فكرة لهذا الموسم: ${title}.`,
      (title) => `اكتشف ${title} عن قرب.`,
      (title) => `اكتشف ${title} وتفاصيله.`,
      (title) => `اكتشف كيف يمكن أن يناسب ${title} يومك.`,
      (title) => `تصفح ${title} لمعرفة المزيد.`,
    ],
    cta: 'عرض التفاصيل',
  },
};

const rtlLanguages = new Set(['arabic']);

export function localizedCopy(language, product) {
  const key = String(language).trim().toLowerCase();
  const localized = copyByLanguage[key];
  if (!localized) {
    throw new Error(`Offline localization is not available for "${language}". Use English, Spanish, French, Swahili, or Arabic.`);
  }
  const price = product.price == null ? '' : `${product.currency ? `${product.currency} ` : ''}${Number(product.price).toFixed(2)}`;
  return {
    copies: localized.templates.map((template) => template(product.title, price, product.description)),
    callToAction: localized.cta,
    rtl: rtlLanguages.has(key),
  };
}
