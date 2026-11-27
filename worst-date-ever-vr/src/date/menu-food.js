export function createMenuFood(THREE, item) {
  const model = new THREE.Group();
  model.name = item.name;
  const materials = new Map();
  function mesh(parent, geometry, color, x, y, z, opacity = 1) {
    const key = color + ':' + opacity;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({
      color, roughness: .7, transparent: opacity < 1, opacity, depthWrite: opacity === 1
    }));
    const part = new THREE.Mesh(geometry, materials.get(key));
    part.position.set(x, y, z);
    parent.add(part);
    return part;
  }
  const ball = (p, color, x, y, z, a, b, c) => {
    const part = mesh(p, new THREE.IcosahedronGeometry(1, 1), color, x, y, z);
    part.scale.set(a, b, c);
    return part;
  };
  const block = (p, color, x, y, z, w, h, d) =>
    mesh(p, new THREE.BoxGeometry(w, h, d), color, x, y, z);
  const disk = (p, color, x, y, z, top, bottom, h, segments = 14) =>
    mesh(p, new THREE.CylinderGeometry(top, bottom, h, segments), color, x, y, z);
  const leaf = (p, x, y, z) => ball(p, 0x548137, x, y, z, .012, .003, .006);
  const portions = [];
  function portion(x, z, build) {
    const piece = new THREE.Group();
    piece.position.set(x, 0, z);
    model.add(piece);
    portions.push(piece);
    build(piece);
  }
  function arrange(count, build, radius = .052) {
    for (let i = 0; i < count; i++) {
      const angle = i * Math.PI * 2 / count;
      portion(Math.cos(angle) * radius, Math.sin(angle) * radius, p => {
        p.rotation.y = angle * .65;
        build(p, i);
      });
    }
  }
  const gold = 0xd59a51, toast = 0xa76233, red = 0xd34d38, cream = 0xffebbf;
  const bread = p => {
    ball(p, toast, 0,.010,0,.033,.010,.024);
    ball(p, gold, 0,.017,0,.029,.006,.021);
  };
  const mushroom = (p, x, y, z) => {
    disk(p, cream, x,y,z,.005,.006,.009,7);
    ball(p, 0x8a5944,x,y+.006,z,.013,.005,.010);
  };
  const recipes = {
    'cafe-pao-queijo': () => arrange(4, p => {
      ball(p, gold,0,.020,0,.026,.021,.025);
      ball(p, 0xffce76,-.005,.033,0,.015,.008,.018);
    }),
    'cafe-torrada': () => arrange(3, p => {
      bread(p); mushroom(p,-.012,.027,0); mushroom(p,.009,.026,.006); leaf(p,.009,.036,-.006);
    }),
    'cafe-tostada': () => arrange(3, p => {
      bread(p);
      for (let i = -1; i <= 1; i++) ball(p, 0x9abf51,i*.014,.025,0,.010,.005,.020);
      block(p, red,.011,.028,.007,.012,.010,.012);
    }),
    'cafe-quiche': () => arrange(3, p => {
      disk(p, toast,0,.012,0,.026,.022,.024,3);
      disk(p, cream,0,.025,0,.023,.024,.007,3);
      leaf(p,.008,.031,0);
    }),
    'cafe-bolo': () => arrange(3, p => {
      block(p, 0xe98b39,0,.022,0,.042,.043,.040);
      block(p, 0x553123,0,.046,0,.045,.008,.043);
    }),
    'cafe-torta': () => arrange(3, p => {
      disk(p, toast,0,.008,0,.027,.024,.016,3);
      disk(p, 0xe9d068,0,.022,0,.024,.024,.014,3);
      ball(p, 0xfff3dc,0,.033,0,.014,.009,.015);
    }),
    'sushi-edamame': () => arrange(6, p => {
      for (let i = -1; i <= 1; i++) ball(p, 0x7d9c42,i*.011,.009,Math.abs(i)*.005,.015,.010,.008);
    }),
    'sushi-sunomono': () => arrange(6, p => {
      const slice = disk(p, 0x527b37,0,.008,0,.025,.025,.007);
      slice.rotation.z = .28;
      disk(p, 0xc2d387,0,.012,0,.020,.020,.005).rotation.z = .28;
      block(p, cream,.006,.017,.003,.004,.002,.003);
    }),
    'sushi-omakase': () => arrange(6, (p,i) => {
      ball(p, 0xfff5e5,0,.012,0,.026,.013,.014);
      ball(p, [0xf39378,0xa93346,0xe6be67][i%3],0,.025,0,.028,.006,.016);
      block(p, 0xf2d1af,.006,.029,0,.003,.002,.021).rotation.y = .28;
    }, .055),
    'sushi-combinado': () => arrange(6, (p,i) => {
      disk(p, 0x314335,0,.014,0,.019,.019,.027,12);
      disk(p, 0xfff5e5,0,.028,0,.016,.016,.004,12);
      disk(p, [0xf39378,0xa93346,0x9aae5d][i%3],0,.031,0,.007,.007,.004,8);
    }),
    'sushi-mochi': () => arrange(2, p => {
      ball(p, 0xe8a1b5,0,.019,0,.030,.021,.027);
      ball(p, 0xf8d3d9,.009,.035,0,.013,.004,.012);
    }),
    'sushi-tempura-doce': () => arrange(3, p => {
      ball(p, gold,-.007,.012,0,.031,.012,.015).rotation.y = .35;
      ball(p, cream,.013,.022,.008,.021,.020,.020);
    }),
    'bistro-bruschetta': () => arrange(3, p => {
      bread(p);
      for (let i = -1; i <= 1; i++) block(p, red,i*.013,.027,i*.004,.013,.011,.014).rotation.y = i;
      leaf(p,.005,.035,.004);
    }),
    'bistro-caprese': () => arrange(4, p => {
      disk(p, red,0,.010,0,.025,.025,.010);
      disk(p, cream,.006,.020,0,.020,.020,.009);
      leaf(p,.009,.027,0);
    }),
    'bistro-risoto': () => arrange(5, (p,i) => {
      ball(p, 0xdac48c,0,.010,0,.031,.014,.029);
      for (let k = 0; k < 5; k++) {
        const angle = i + k * 2.4;
        ball(p, cream,Math.cos(angle)*.020,.019+k%2*.003,Math.sin(angle)*.019,.007,.004,.004);
      }
      mushroom(p,.009,.022,.006);
    }, .031),
    'bistro-massa': () => arrange(5, (p,i) => {
      ball(p, 0xbc422e,0,.006,0,.030,.008,.019);
      for (let k = -1; k <= 1; k++) {
        const gnocco = ball(p, k === 0 ? 0xde7651 : cream,k*.013,.012,k%2*.009,.011,.008,.008);
        gnocco.rotation.y = i;
      }
      leaf(p,.010,.020,.006);
    }, .045),
    'bistro-tiramisu': () => arrange(3, p => {
      for (let i = 0; i < 5; i++) block(p, [toast,cream,0x99623e,cream,0x583721][i],0,.005+i*.009,0,.039,.009,.039);
    }),
    'bistro-panna': () => arrange(2, p => {
      disk(p, 0xffe5ab,0,.018,0,.021,.029,.035);
      disk(p, 0xa02e56,0,.036,0,.021,.021,.004);
      ball(p, 0x662b4c,.009,.043,0,.008,.008,.008);
    }),
    'bar-mandioca': () => arrange(5, (p,i) => {
      const stick = block(p, 0xe9bd68,0,.011,0,.055,.021,.017);
      stick.rotation.y = i * .73;
    }, .043),
    'bar-pastel': () => arrange(3, p => {
      block(p, gold,0,.009,0,.056,.015,.037);
      ball(p, 0xeab966,0,.019,0,.024,.010,.015);
      for (const x of [-.022,0,.022]) block(p, 0xbd803c,x,.016,.016,.005,.003,.006);
    }),
    'bar-espetinho': () => arrange(2, p => {
      block(p, 0xb38653,0,.010,0,.094,.004,.005);
      for (let i = -2; i <= 2; i++) block(p, [0x8a4533,0xe9c698,0xa75c3d][Math.abs(i)%3],
        i*.014,.015,0,.016,.023,.024).rotation.y = i*.19;
    }),
    'bar-queijo-coalho': () => arrange(3, p => {
      block(p, 0xb38653,0,.010,0,.078,.004,.004);
      block(p, cream,-.006,.015,0,.043,.025,.030);
      for (const x of [-.019,-.006,.007]) block(p, toast,x,.028,0,.004,.002,.026);
    }),
    'bar-pudim': () => arrange(2, p => {
      disk(p, 0xf0c77c,0,.017,0,.022,.029,.034);
      disk(p, 0xa65d2e,0,.035,0,.022,.023,.005);
      disk(p, 0xab6933,0,.003,0,.033,.033,.006);
    }),
    'bar-doce-leite': () => arrange(3, p => {
      block(p, cream,0,.010,0,.046,.020,.035);
      ball(p, 0xb77745,0,.023,0,.021,.014,.014);
    })
  };
  const drinks = {
    'cafe-kombucha': { color: 0xbb6562, fruit: 0x9e2940, height: .095 },
    'cafe-cafe-gelado': { color: 0x724832, milk: 0xcb9d74, ice: true, height: .106 },
    'sushi-cha-verde': { color: 0x8fa14b, ice: true, height: .083 },
    'sushi-limonada': { color: 0xe0d267, fruit: 0xefc441, ice: true, height: .092 },
    'bistro-limonada': { color: 0xe2db85, fruit: 0xf3d54b, ice: true, height: .106 },
    'bistro-cha': { color: 0xa73254, fruit: 0xf19539, ice: true, height: .105 },
    'bar-cerveja': { color: 0xd89838, foam: true, height: .128 },
    'bar-soda': { color: 0xc2df9d, fruit: 0xaacd54, mint: true, ice: true, height: .112 }
  };
  const drink = drinks[item.id];
  if (drink) {
    const h = drink.height;
    const glass = mesh(model, new THREE.CylinderGeometry(.036,.027,h,16,1,true), 0xe7eff0,0,h/2,0,.28);
    glass.material.side = THREE.DoubleSide;
    disk(model, 0xe4edef,0,.004,0,.028,.028,.008);
    disk(model, drink.color,0,h*.39,0,.033,.025,h*.72);
    if (drink.milk) disk(model, drink.milk,0,h*.19,0,.029,.026,h*.30);
    if (drink.foam) disk(model, 0xfff0d1,0,h*.80,0,.035,.033,h*.16);
    if (drink.ice) for (const x of [-.012,.010]) {
      const ice = mesh(model, new THREE.BoxGeometry(.019,.013,.017), 0xe0edf0,x,h*.76,x/2,.66);
      ice.rotation.set(.3,x*60,.2);
    }
    if (drink.fruit) disk(model, drink.fruit,.031,h*.91,0,.014,.014,.005,10).rotation.z = .95;
    if (drink.mint) leaf(model,-.013,h*.85,.009);
  } else if (recipes[item.id]) recipes[item.id]();
  else throw new Error('Missing menu model for ' + item.id);
  return { model, portions, dispose() {
    model.traverse(part => part.geometry?.dispose());
    for (const material of materials.values()) material.dispose();
    model.removeFromParent();
  } };
}
