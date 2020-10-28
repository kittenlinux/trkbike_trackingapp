import React, { Component } from 'react';
import { Alert, BackHandler, PermissionsAndroid, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CameraKitCameraScreen } from 'react-native-camera-kit';
import DeviceInfo from 'react-native-device-info';
import AsyncStorage from '@react-native-community/async-storage';
import Geolocation from 'react-native-geolocation-service';
import VIForegroundService from '@voximplant/react-native-foreground-service';
import {
  gyroscope,
  setUpdateIntervalForType,
  SensorTypes
} from "react-native-sensors";
import DialogProgress from 'react-native-dialog-progress'
import appConfig from './app.json';

let base_url = 'https://www.trackmycars.net/bike/Api/V1/';
let calibrate;
let detectgyro;

export default class App extends Component {
  constructor() {
    super();

    setUpdateIntervalForType(SensorTypes.gyroscope, 2000);

    this.state = {
      QR_Code_Value: '',
      Start_Scanner: false,
      loading: false,
      mac_addr: '',
      forceLocation: true,
      highAccuracy: true,
      loading: false,
      showLocationDialog: true,
      significantChanges: false,
      updatesEnabled: false,
      foregroundService: true,
      deviceInfo: '',
      location: [],
      location_onetime: [],
      x: 0,
      y: 0,
      z: 0,
      x_low: 0,
      y_low: 0,
      z_low: 0,
      x_high: 0,
      y_high: 0,
      z_high: 0,
      event_count: 0
    };
  }

  componentDidMount() {
    DeviceInfo.getMacAddress().then(mac => { mac_addr = JSON.stringify(mac).slice(1, JSON.stringify(mac).length - 1); });
    this.backHandler = BackHandler.addEventListener('hardwareBackPress', this.handleBackPress);

    this.getDeviceInfo();
  }

  componentWillUnmount() {
    this.backHandler.remove();
  }

  hasLocationPermission = async () => {
    if (Platform.OS === 'android' && Platform.Version < 23) {
      return true;
    }

    const hasPermission = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );

    if (hasPermission) {
      return true;
    }

    const status = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );

    if (status === PermissionsAndroid.RESULTS.GRANTED) {
      return true;
    }

    if (status === PermissionsAndroid.RESULTS.DENIED) {
      ToastAndroid.show(
        'Location permission denied by user.',
        ToastAndroid.LONG,
      );
    } else if (status === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
      ToastAndroid.show(
        'Location permission revoked by user.',
        ToastAndroid.LONG,
      );
    }

    return false;
  };

  getLocation = async () => {
    const promise = new Promise((resolve, reject) => {
      this.setState({ loading: true }, () => {
        Geolocation.getCurrentPosition(
          (position) => {
            this.setState({ loading: false });
            resolve(position);
          },
          (error) => {
            this.setState({ loading: false });
            resolve(error);
          },
          {
            enableHighAccuracy: this.state.highAccuracy,
            timeout: 10000,
            maximumAge: 5000,
            distanceFilter: 0,
            forceRequestLocation: this.state.forceLocation,
            showLocationDialog: this.state.showLocationDialog,
          }
        );
      });
    });
    const result = await promise;
    return result;
  };

  formTrackData = async (lat, lng, event) => {
    const bikeId = await AsyncStorage.getItem('bike_key');
    const user = await AsyncStorage.getItem('user_id');
    const macAddr = await AsyncStorage.getItem('mac_address');
    const promise = new Promise((resolve, reject) => {
      var res = {
        bikeId: bikeId,
        user: user,
        macAddr: macAddr,
        lat: lat,
        lng: lng,
        event: event
      }
      resolve(res)
    });
    const result = await promise;
    return result;
  }

  getLocationUpdates = async () => {
    const hasLocationPermission = await this.hasLocationPermission();

    if (!hasLocationPermission) {
      return;
    }

    const locat = await this.getLocation();

    if (locat.code) {
      Alert.alert(
        'ผิดพลาด',
        `${locat.message}

พบปัญหาในการอ่านค่าตำแหน่ง โปรดตรวจสอบอุปกรณ์`
      );
    } else {
      var trkdata_start = await this.formTrackData(locat.coords.latitude, locat.coords.longitude, '301')

      const options = {
        title: "กำลังประมวลผลข้อมูล",
        message: "โปรดรอสักครู่...",
        isCancelable: false
      }
      DialogProgress.show(options)

      fetch(base_url + 'track', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(trkdata_start),
      })
        .then((response) => response.json())
        .then(async (responseData) => {
          DialogProgress.hide()
          if (responseData.code == 'SUCCESS') {
            Alert.alert(
              'สำเร็จ',
              responseData.message
            );
            this.prepareTracking();
          }
          else if (responseData.code == 'DISABLED') {
            Alert.alert(
              'ผิดพลาด',
              `${responseData.message}

โปรดเปิดการใช้งานรถจักรยานยนต์ในระบบแล้วเปิดการติดตามอีกครั้ง`
            );
          }
          else if (responseData.code == 'INVALID') {
            let removedata = await this.removeBikeDatafromAsync()
            this.getDeviceInfo();
            Alert.alert(
              'ผิดพลาด',
              `${responseData.message}

มีอุปกรณ์ใหม่ถูกใช้งานแทนที่แล้ว โปรดสแกนคิวอาร์โค้ดใหม่อีกครั้ง`
            );
          }
          else if (responseData.code == 'FAIL') {
            Alert.alert(
              'ผิดพลาด',
              `${responseData.message}

โปรดตรวจสอบข้อมูลอีกครั้ง`
            );
          }
        }).catch((error) => console.error(error))
    }

  };

  prepareTracking = async () => {
    if (Platform.OS === 'android' && this.state.foregroundService) {
      await this.startForegroundService();
    }

    this.detectGyroscope();

    this.setState({ updatesEnabled: true }, () => {
      this.watchId = Geolocation.watchPosition(
        async (position) => {
          this.setState({ location: position });
          var trkdata_track = await this.formTrackData(position.coords.latitude, position.coords.longitude, '1')

          fetch(base_url + 'track', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(trkdata_track),
          })
            .then((response) => response.json())
            .then((responseData) => {
              if (responseData.code == 'SUCCESS') {
              }
              else if (responseData.code == 'FAIL') {
              }
            }).catch((error) => console.error(error))
        },
        (error) => {
          this.setState({ location: error });
        },
        {
          enableHighAccuracy: this.state.highAccuracy,
          distanceFilter: 50,
          interval: 60000,
          fastestInterval: 30000,
          forceRequestLocation: this.state.forceLocation,
          showLocationDialog: this.state.showLocationDialog,
          useSignificantChanges: this.state.significantChanges,
        },
      );
    });
  }

  removeLocationUpdates = async () => {
    if (this.watchId !== null) {
      this.stopForegroundService();
      Geolocation.clearWatch(this.watchId);
      this.watchId = null;
      this.setState({ updatesEnabled: false });
    }
  };

  startForegroundService = async () => {
    if (Platform.Version >= 26) {
      await VIForegroundService.createNotificationChannel({
        id: 'locationChannel',
        name: 'Location Tracking Channel',
        description: 'ติดตามและตรวจจับการโจรกรรมของผู้ใช้',
        enableVibration: false,
      });
    }

    return VIForegroundService.startService({
      channelId: 'locationChannel',
      id: 420,
      title: appConfig.displayName,
      text: 'กำลังติดตามและตรวจจับการโจรกรรม',
      icon: 'ic_launcher',
    });
  };

  stopForegroundService = async () => {
    if (this.state.foregroundService) {
      VIForegroundService.stopService().catch((err) => err);
    }

    this.stopDetect();

    const locat = await this.getLocation();

    if (locat.code) {
      Alert.alert(
        'ผิดพลาด',
        `${locat.message}

พบปัญหาในการอ่านค่าตำแหน่ง โปรดตรวจสอบอุปกรณ์`
      );
    } else {
      var trkdata_stop = await this.formTrackData(locat.coords.latitude, locat.coords.longitude, '302')

      fetch(base_url + 'track', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(trkdata_stop),
      })
        .then((response) => response.json())
        .then((responseData) => {
          if (responseData.code == 'SUCCESS') {
            Alert.alert(
              'สำเร็จ',
              responseData.message
            );
          }
          else if (responseData.code == 'FAIL') {
            Alert.alert(
              'ผิดพลาด',
              `${responseData.message}

โปรดตรวจสอบข้อมูลอีกครั้ง`
            );
          }
        }).catch((error) => console.error(error))
    }
  };

  handleBackPress = () => {
    if (!this.state.Start_Scanner && !this.state.updatesEnabled) {
      Alert.alert(
        'ออกจากโปรแกรม',
        'คุณต้องการออกไปยังหน้าหลักหรือไม่ ?',
        [
          { text: 'ไม่ใช่', style: 'cancel' },
          {
            text: 'ใช่', onPress: () => {
              BackHandler.exitApp()
            }
          },
        ],
        { cancelable: true });
    }
    else if (this.state.Start_Scanner)
      this.setState({ Start_Scanner: false });
    else if (this.state.updatesEnabled) {
      Alert.alert(
        'ผิดพลาด',
        `การติดตามกำลังทำงาน โปรดกดปุ่ม Home เพื่อพับหน้าจอและให้การติดตามทำงานในพื้นหลัง หรือปิดการติดตามแล้วลองอีกครั้ง`
      );
    }
    return true;
  }

  onQR_Code_Scan_Done = (QR_Code) => {
    var qrdata, isJSON = '1';

    try {
      qrdata = JSON.parse(QR_Code);
    }
    catch {
      Alert.alert('ผิดพลาด', 'รูปแบบคิวอาร์โค้ดไม่ถูกต้อง โปรดตรวจสอบข้อมูลอีกครั้ง');
      isJSON = '0';
    }

    if (isJSON == '1') {
      qrdata.macAddr = mac_addr;

      const options = {
        title: "กำลังประมวลผลข้อมูล",
        message: "โปรดรอสักครู่...",
        isCancelable: false
      }
      DialogProgress.show(options)

      fetch(base_url + 'register_check', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(qrdata),
      })
        .then((response) => response.json())
        .then((responseData) => {
          this.setState({
            loading: false
          });

          DialogProgress.hide()

          var bikedata = responseData.data;

          if (responseData.code == 'SUCCESS') {
            if (bikedata.mac_status === '0')
              var mac_msg = `ยังไม่มีการผูกอุปกรณ์ใด ๆ เข้ากับรถคันนี้
ที่อยู่ MAC Address ${mac_addr} จะถูกผูกเข้ากับรถจักรยานยนต์คันนี้`;
            else if (bikedata.mac_status === '1')
              var mac_msg = `อุปกรณ์นี้คืออุปกรณ์เดิมที่ท่านเคยผูกมาก่อนหน้านี้
ที่อยู่ MAC Address ${mac_addr} จะถูกผูกเข้ากับรถจักรยานยนต์คันนี้อีกครั้ง`;
            else if (bikedata.mac_status === '2')
              var mac_msg = `มีการผูกอุปกรณ์อื่นเข้ากับรถจักรยานยนต์คันนี้อยู่แล้ว !
ที่อยู่ MAC Address ${mac_addr} จะถูกผูกเข้ากับรถจักรยานยนต์คันนี้แทนที่อุปกรณ์เดิม`;

            Alert.alert(
              'ตรวจสอบข้อมูล',
              `${responseData.message}

ผู้ใช้งาน : ${bikedata.username}
หมายเลขทะเบียน : ${bikedata.plate}

ยี่ห้อ รุ่น : ${bikedata.model}
สี : ${bikedata.color}

${mac_msg}

ยืนยันการผูกอุปกรณ์เข้ากับรถจักรยานยนต์ ?`,
              [
                { text: 'ยกเลิก', style: 'cancel' },
                {
                  text: 'ยืนยัน', onPress: () => {
                    var bikedata_confirm = {
                      user: bikedata.users_user,
                      bikeId: bikedata.bike_id,
                      macAddr: mac_addr
                    };

                    const options = {
                      title: "กำลังประมวลผลข้อมูล",
                      message: "โปรดรอสักครู่...",
                      isCancelable: false
                    }
                    DialogProgress.show(options)

                    fetch(base_url + 'register_confirm', {
                      method: 'POST',
                      headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify(bikedata_confirm),
                    })
                      .then((response) => response.json())
                      .then(async (responseData) => {
                        DialogProgress.hide()

                        if (responseData.code == 'SUCCESS') {
                          let savedata = await this.saveBikeDatatoAsync(bikedata.users_user, bikedata.bike_id, mac_addr, bikedata.username, bikedata.plate, bikedata.model, bikedata.color)
                          this.getDeviceInfo();
                          Alert.alert(
                            'สำเร็จ',
                            responseData.message
                          );
                        }
                        else if (responseData.code == 'FAIL') {
                          Alert.alert(
                            'ผิดพลาด',
                            `${responseData.message}

โปรดตรวจสอบข้อมูลอีกครั้ง`
                          );
                        }
                      })
                  }
                },
              ],
              { cancelable: false }
            );
          } else if (responseData.code == 'FAIL') {
            Alert.alert(
              'ผิดพลาด',
              `${responseData.message}

โปรดตรวจสอบข้อมูลอีกครั้ง`
            );
          }
        }).catch((error) => console.error(error))
    }

    this.setState({ QR_Code_Value: QR_Code });
    this.setState({ Start_Scanner: false });
  }

  open_QR_Code_Scanner = () => {
    var that = this;

    if (Platform.OS === 'android') {
      async function requestCameraPermission() {
        try {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.CAMERA, {
            title: 'ขอสิทธิ์การใช้กล้องถ่ายรูป',
            message: 'แอปพลิเคชันต้องการขอสิทธิ์เพื่อใช้งานกล้อง',
            buttonPositive: 'ตกลง'
          }
          )
          if (granted === PermissionsAndroid.RESULTS.GRANTED) {

            that.setState({ QR_Code_Value: '' });
            that.setState({ Start_Scanner: true });

          } else {
            Alert.alert("ผิดพลาด", "การขอสิทธิ์เพื่อใช้งานกล้องถูกปฏิเสธ");
          }
        } catch (err) {
          Alert.alert("ผิดพลาด", "พบปัญหาในการขอสิทธิ์เพื่อใช้งานกล้อง");
          console.warn(err);
        }
      }
      requestCameraPermission();
    } else {
      that.setState({ QR_Code_Value: '' });
      that.setState({ Start_Scanner: true });
    }
  }

  saveBikeDatatoAsync = async (user, bikeId, mac_addr, username, plate, model, color) => {
    const promise = new Promise(async (resolve, reject) => {
      try {
        await AsyncStorage.setItem('user_id', user)
        await AsyncStorage.setItem('bike_key', bikeId)
        await AsyncStorage.setItem('mac_address', mac_addr)
        await AsyncStorage.setItem('username', username)
        await AsyncStorage.setItem('plate', plate)
        await AsyncStorage.setItem('model', model)
        await AsyncStorage.setItem('color', color)
        resolve('1')
      } catch (e) {
        Alert.alert("ผิดพลาด", "พบปัญหาในการเก็บข้อมูลรถจักรยานยนต์ โปรดติดต่อผู้ดูแลระบบ");
        resolve('0')
      }
    });
    const result = await promise;
    return result;
  }

  removeBikeDatafromAsync = async () => {
    const promise = new Promise(async (resolve, reject) => {
      try {
        await AsyncStorage.removeItem('user_id')
        await AsyncStorage.removeItem('bike_key')
        await AsyncStorage.removeItem('mac_address')
        await AsyncStorage.removeItem('username')
        await AsyncStorage.removeItem('plate')
        await AsyncStorage.removeItem('model')
        await AsyncStorage.removeItem('color')
        resolve('1')
      } catch (e) {
        Alert.alert("ผิดพลาด", "พบปัญหาในการจัดการข้อมูลรถจักรยานยนต์ โปรดติดต่อผู้ดูแลระบบ");
        resolve('0')
      }
    });
    const result = await promise;
    return result;
  }

  getDeviceInfo = async () => {
    if (await AsyncStorage.getItem('bike_key')) {
      let username = await AsyncStorage.getItem('username');
      let plate = await AsyncStorage.getItem('plate');
      let model = await AsyncStorage.getItem('model');
      let color = await AsyncStorage.getItem('color');

      var data = `
ชื่อผู้ใช้ : ${username}
หมายเลขทะเบียน : ${plate}
รุ่น : ${model}
สี : ${color}`
      this.setState({ deviceInfo: data })
    }
    else {
      var data = `
ยังไม่มีการลงทะเบียนอุปกรณ์`
      this.setState({ deviceInfo: data })
    }
  }

  onBottomButtonPressed = () => {
    this.setState({ Start_Scanner: false });
  }

  calibrateGyroscope = async () => {
    const promise = new Promise((resolve, reject) => {
      const options = {
        title: "กำลังปรับค่าไจโรสโคป",
        message: "โปรดรอสักครู่...",
        isCancelable: false
      }
      DialogProgress.show(options)
      let test = 0;
      calibrate = gyroscope.subscribe(({ x, y, z, timestamp }) => {
        if (test === 0) {
          this.setState({
            x_low: x,
            y_low: y,
            z_low: z,
            x_high: x,
            y_high: y,
            z_high: z,
          })
          this.setState({
            x: x,
            y: y,
            z: z
          })
          test++;
        } else {
          if (x <= this.state.x_low)
            this.setState({ x_low: x })
          else if (x >= this.state.x_high)
            this.setState({ x_high: x })
          if (y <= this.state.y_low)
            this.setState({ y_low: y })
          else if (y >= this.state.y_high)
            this.setState({ y_high: y })
          if (z <= this.state.z_low)
            this.setState({ z_low: z })
          else if (z >= this.state.z_high)
            this.setState({ z_high: z })
          this.setState({
            x: x,
            y: y,
            z: z
          })
          test++;
          if (test === 30) {
            this.stopCalibrate();
            DialogProgress.hide()
            resolve(test);
          }
        }
      }
      );
    });
    const result = await promise;
  }

  stopCalibrate = () => {
    calibrate.unsubscribe()
  }

  detectGyroscope = () => {
    detectgyro = gyroscope.subscribe(({ x, y, z, timestamp }) => {
      this.setState({
        x: x,
        y: y,
        z: z
      })
      if (this.state.x < this.state.x_low)
        this.setState({ event_count: this.state.event_count + 1 })
      else if (this.state.x > this.state.x_high)
        this.setState({ event_count: this.state.event_count + 1 })
      else if (this.state.y < this.state.y_low)
        this.setState({ event_count: this.state.event_count + 1 })
      else if (this.state.y > this.state.y_high)
        this.setState({ event_count: this.state.event_count + 1 })
      else if (this.state.z < this.state.z_low)
        this.setState({ event_count: this.state.event_count + 1 })
      else if (this.state.z > this.state.z_high)
        this.setState({ event_count: this.state.event_count + 1 })
      else {
        this.setState({ event_count: -1 })
      }
      if (this.state.event_count === 29) {
        this.stopDetect();
        this.alertDetection();
      }
    });
  }

  stopDetect = () => {
    detectgyro.unsubscribe()
  }

  alertDetection = async () => {
    const locat = await this.getLocation();
    var trkdata_detect = await this.formTrackData(locat.coords.latitude, locat.coords.longitude, '201')

    fetch(base_url + 'track', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(trkdata_detect),
    })
      .then((response) => response.json())
      .then((responseData) => {
        if (responseData.code == 'SUCCESS') {
        }
        else if (responseData.code == 'FAIL') {
        }
      }).catch((error) => console.error(error))

    if (this.watchId !== null) {
      Geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    this.setState({ updatesEnabled: true }, () => {
      this.watchId = Geolocation.watchPosition(
        async (position) => {
          this.setState({ location: position });
          var trkdata_thief = await this.formTrackData(position.coords.latitude, position.coords.longitude, '11')
          fetch(base_url + 'track', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(trkdata_thief),
          })
            .then((response) => response.json())
            .then((responseData) => {
              if (responseData.code == 'SUCCESS') {

              }
              else if (responseData.code == 'FAIL') {
              }
            }).catch((error) => console.error(error))
        },
        (error) => {
          this.setState({ location: error });
        },
        {
          enableHighAccuracy: this.state.highAccuracy,
          distanceFilter: 50,
          interval: 30000,
          fastestInterval: 15000,
          forceRequestLocation: this.state.forceLocation,
          showLocationDialog: this.state.showLocationDialog,
          useSignificantChanges: this.state.significantChanges,
        },
      );
    });
  }

  render() {
    const {
      updatesEnabled,
      deviceInfo
    } = this.state;

    if (!this.state.Start_Scanner) {
      return (
        <View style={styles.MainContainer}>
          <Text style={{ fontSize: 22, textAlign: 'center' }}>ยินดีต้อนรับสู่ ลูกข่ายติดตามรถจักรยานยนต์ Track My Bikes</Text>
          <TouchableOpacity
            onPress={this.open_QR_Code_Scanner}
            style={styles.button}>
            <Text style={{ color: '#FFF', fontSize: 14 }}>
              สแกนคิวอาร์โค้ด
            </Text>
          </TouchableOpacity>
          {!updatesEnabled ?
            <TouchableOpacity
              onPress={async () => {
                if (await AsyncStorage.getItem('bike_key') && await AsyncStorage.getItem('user_id') && await AsyncStorage.getItem('mac_address')) {
                  Alert.alert(
                    'เตรียมการเปิดการติดตาม',
                    'โปรดวางโทรศัพท์ไว้ในรถจักรยานยนต์ เมื่อท่านวางโทรศัพท์เรียบร้อยแล้ว กรุณากดปุ่มยืนยัน',
                    [
                      { text: 'ยกเลิก', style: 'cancel' },
                      {
                        text: 'ยืนยัน', onPress: async () => {
                          const calib = await this.calibrateGyroscope()
                          this.getLocationUpdates()
                        }
                      },
                    ],
                    { cancelable: true })
                }
                else {
                  Alert.alert("ผิดพลาด", "ยังไม่ได้ลงทะเบียนอุปกรณ์กับรถจักรยานยนต์ โปรดทำตามขั้นตอนที่ปุ่ม \"สแกนคิวอาร์โค้ด\"");
                }
              }
              } disabled={updatesEnabled}
              style={styles.button}>
              <Text style={{ color: '#FFF', fontSize: 24 }}>
                เปิดการติดตาม
            </Text>
            </TouchableOpacity> :
            <TouchableOpacity
              onPress={() => this.removeLocationUpdates()} disabled={!updatesEnabled}
              style={styles.button_red}>
              <Text style={{ color: '#FFF', fontSize: 24 }}>
                ปิดการติดตาม
          </Text>
            </TouchableOpacity>}
          <Text style={{ fontSize: 18, textAlign: 'center' }}>{deviceInfo}</Text>
          {/* <Text style={{ fontSize: 12 }}>X: {this.state.x}{"\n"}Y: {this.state.y}{"\n"}Z: {this.state.z}</Text>
          <Text style={{ fontSize: 12 }}>X low: {this.state.x_low}{"\n"}Y low: {this.state.y_low}{"\n"}Z low: {this.state.z_low}</Text>
          <Text style={{ fontSize: 12 }}>X high: {this.state.x_high}{"\n"}Y high: {this.state.y_high}{"\n"}Z high: {this.state.z_high}</Text>
          <Text style={{ fontSize: 12 }}>Event Count: {this.state.event_count}</Text> */}
        </View>
      );
    }
    return (
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: 'bold', textAlign: 'center' }}>เปิดเว็บไซต์ trackmycars.net/bike ทำการเข้าสู่ระบบ และสแกนคิวอาร์โค้ดของรถจักรยานยนต์ที่ท่านต้องการใช้งาน</Text>

        <CameraKitCameraScreen
          showFrame={true}
          scanBarcode={true}
          laserColor={"red"}
          frameColor={"white"}
          onReadCode={event =>
            this.onQR_Code_Scan_Done(event.nativeEvent.codeStringValue)
          }
          actions={{ leftButtonText: 'ยกเลิก' }}
          onBottomButtonPressed={(event) => this.onBottomButtonPressed(event)}
        />

      </View>
    );
  }
}

const styles = StyleSheet.create({
  MainContainer: {
    flex: 1,
    paddingTop: (Platform.OS) === 'ios' ? 20 : 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  QR_text: {
    color: '#000',
    fontSize: 19,
    padding: 8,
    marginTop: 12
  },
  button: {
    backgroundColor: '#2979FF',
    alignItems: 'center',
    padding: 12,
    width: 300,
    marginTop: 14
  },
  button_red: {
    backgroundColor: 'red',
    alignItems: 'center',
    padding: 12,
    width: 300,
    marginTop: 14
  },
});