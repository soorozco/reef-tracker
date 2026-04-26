// Estado global de la app. Persiste el acuario actual en localStorage
// para que entre sesiones la app abra al mismo acuario.

(function () {
  var STORAGE_KEY = 'reef-tracker.current_aquarium_id';

  window.STATE = {
    aquariums: [],          // lista de acuarios cargada desde Supabase
    products: [],           // catálogo de productos
    currentAquariumId: null,

    setAquariums: function (list) {
      this.aquariums = list || [];
    },
    setProducts: function (list) {
      this.products = list || [];
    },
    getCurrentAquarium: function () {
      var id = this.currentAquariumId;
      for (var i = 0; i < this.aquariums.length; i++) {
        if (this.aquariums[i].id === id) return this.aquariums[i];
      }
      return null;
    },
    setCurrentAquariumId: function (id) {
      this.currentAquariumId = id;
      try { localStorage.setItem(STORAGE_KEY, String(id)); } catch (e) {}
    },
    loadCurrentAquariumId: function () {
      try {
        var v = localStorage.getItem(STORAGE_KEY);
        if (v) this.currentAquariumId = parseInt(v, 10) || null;
      } catch (e) {}
    },
    findProductById: function (id) {
      for (var i = 0; i < this.products.length; i++) {
        if (this.products[i].id === id) return this.products[i];
      }
      return null;
    }
  };
})();
