'use strict';

module.exports = (sequelize, DataTypes) => {
  const Address = sequelize.define('Address', {
    address: DataTypes.STRING(35),
  }, {
    timestamps: false,
    indexes: [{
      unique: true,
      fields: ['address']
    }],
  });

  const AddressVout = sequelize.define('AddressVout', {}, { timestamps: false });

  Address.associate = function (models) {
    models.Address.belongsToMany(models.Vout, { through: 'AddressVout' });
  };

  return Address;
};
