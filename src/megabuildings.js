// Fractions of the existing lot and height keep the new masses inside the flight envelope.
export function towerMasses(b) {
  if (b.type === 11 || b.type === 12 || b.h < (b.style === 3 ? 17 : 27)) return null;
  const masses = [];
  const block = (from,to,w,d,options) => masses.push({from,to,w,d,...options});
  const podium = Math.max(.14,7/b.h);
  const tall = b.h >= 74;
  const flip = b.type % 2 ? -1 : 1;
  block(0,podium,.98,.98,{bevel:.038});

  switch (b.style) {
    // Entropism: concrete utility decks carry infill from different generations.
    case 0:
      block(podium,.98,.43,.64,{shift:-flip*.21,skin:'#918b77',bevel:.045});
      block(.20,.94,.20,.33,{shift:flip*.34,skin:'#595f58'});
      for (const [i,y] of (tall ? [.35,.63,.87] : [.49,.89]).entries()) {
        block(y-.19,y,.50,i%2 ? .62 : .74,{shift:flip*.20,slide:i%2 ? .065 : -.045,bevel:.05});
        block(y,y+.045,.96,.94,{skin:i%2 ? '#928f7e' : '#a69b83',bevel:.065});
        block(y+.045,y+.057,.90,.87,{skin:'#544e40',bevel:.065,serviceDeck:!tall && i===1});
      }
      block(.94,1,.26,.29,{shift:-flip*.21,skin:'#847b65',bevel:.08});
      break;

    // Neo-Militarism: a recessed core between two continuous armored frames.
    case 1:
      block(podium,.95,.43,.57,{bevel:.13});
      for (const side of [-1,1]) {
        const high = side === flip ? 1 : .94;
        block(.10,.52,.29,.91,{shift:side*.323,topW:.23,topD:.67,lean:side*.035,
          bevel:.25,skin:side===1 ? '#687681' : '#576673'});
        block(.52,high,.23,.67,{shift:side*.358,topW:.14,topD:.44,lean:-side*.065,
          bevel:.25,skin:side===1 ? '#778791' : '#626f7b'});
      }
      block(.23,.285,.82,.77,{bevel:.14,skin:'#404b56'});
      block(.70,.765,.78,.73,{bevel:.19,topW:.74,topD:.67,skin:'#586570'});
      block(.80,.96,.19,.29,{bevel:.15,skin:'#333f48'});
      break;

    // Kitsch: bright, replaceable market halls bolted around a dark lift core.
    case 2: {
      block(.11,.93,.36,.49,{shift:-flip*.05,bevel:.09,skin:'#51434d'});
      const galleries = tall ? [[.19,.32,.70],[.46,.60,.84],[.74,.87,.67]] : [[.25,.46,.78],[.64,.86,.73]];
      for (const [i,[low,high,w]] of galleries.entries()) {
        const shift = (i%2 ? -flip : flip)*Math.min(.076,(.988-w-.10)*.5);
        const slide = i%2 ? -.045 : .052;
        const skin = ['#d45675','#54a9a0','#cb8951'][i];
        block(low-.041,low,w+.10,.88,{shift,slide,topW:w+.07,bevel:.16,skin});
        block(low,high,w,.74,{shift,slide,bevel:.09});
        block(high,high+.043,w+.08,.87,{shift,slide,topW:w-.03,bevel:.16,skin});
      }
      block(.90,1,.39,.13,{shift:flip*.15,topW:.31,lean:-flip*.07,skin:'#ab5365',bevel:.13});
      break;
    }

    // High-tech industrialism: process drums, exposed risers and transfer decks.
    case 3:
      block(podium,.46,.86,.74,{shift:-flip*.043,bevel:.085});
      block(.45,.52,.91,.81,{topW:.80,topD:.72,bevel:.10,skin:'#a88658'});
      block(.52,.77,.57,.67,{shift:flip*.08,bevel:.09,skin:'#656d60'});
      for (const side of [-1,1]) {
        const high=side===flip ? 1 : .91, shift=side*.29;
        block(.36,high-.07,.26,.36,{shift,slide:-.24,sides:8,skin:side===flip ? '#996c51' : '#6d7774'});
        block(high-.07,high,.30,.41,{shift,slide:-.24,sides:8,topW:.22,topD:.30,skin:'#635449'});
      }
      break;

    // Neo-Kitsch: space-consuming ceramic shells and open terraces.
    case 4:
      block(.10,.94,.39,.44,{shift:-flip*.035,sides:8,skin:'#78685b'});
      for (const [i,y] of (tall ? [.35,.73] : [.56]).entries()) {
        const shift=(i%2 ? flip : -flip)*.066;
        const shell=.84+i*.02;
        block(y-.16,y-.076,.48,.45,{shift,sides:12,topW:shell,topD:.89,skin:'#d9c9a9'});
        block(y-.076,y+.035,shell,.89,{shift,sides:12,topW:shell-.044,topD:.82});
        block(y+.035,y+.103,shell-.025,.84,{shift,sides:12,topW:.56,topD:.55,skin:'#e9dcba'});
        block(y+.105,y+.125,.55,.50,{shift,sides:12,skin:'#917750'});
      }
      block(.91,1,.26,.30,{shift:flip*.049,sides:8,topW:.16,topD:.20,skin:'#c8ad7a'});
      break;

    // Metabolist conservatories: cantilevered glasshouses plug into a single service spine.
    case 5:
      block(.10,1,.27,.58,{shift:-flip*.27,bevel:.10,topD:.46,skin:'#647d68'});
      for (const [i,y] of (tall ? [.38,.74] : [.59]).entries()) {
        const slide=i%2 ? -.088 : .076, shift=flip*(i%2 ? .138 : .09);
        block(y-.10,y-.041,.71,.71,{shift,slide,topW:.69,bevel:.12,skin:'#84906e'});
        block(y-.041,y+.055,.67,.69,{shift,slide,bevel:.12,topW:.64,topD:.61});
        block(y+.055,y+.131,.64,.61,{shift,slide,topW:.23,topD:.48,lean:-flip*.13,bevel:.12});
      }
      block(.87,.955,.23,.24,{shift:-flip*.14,slide:-.14,bevel:.13,skin:'#899d83'});
      break;
  }
  return masses;
}
