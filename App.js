import React, { Component } from 'react';
import { Alert, BackHandler, Linking, PermissionsAndroid, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CameraKitCameraScreen } from 'react-native-camera-kit';
import DeviceInfo from 'react-native-device-info';
import AsyncStorage from '@react-native-community/async-storage';
import Geolocation from 'react-native-geolocation-service';

export default class App extends Component {
  constructor() {
    super();

    this.state = {
      QR_Code_Value: '',
      Start_Scanner: false,
      loading: false,
      mac_addr: ''
    };
  }

  componentDidMount() {
    DeviceInfo.getMacAddress().then(mac => { mac_addr = JSON.stringify(mac).slice(1, JSON.stringify(mac).length - 1); });
    this.backHandler = BackHandler.addEventListener('hardwareBackPress', this.handleBackPress);
  }

  componentWillUnmount() {
    this.backHandler.remove();
  }

  handleBackPress = () => {
    if (!this.state.Start_Scanner) {
      Alert.alert(
        'ออกจากโปรแกรม',
        'คุณต้องการออกไปยังหน้าหลักหรือไม่ ?',
        [
          { text: 'ไม่ใช่', onPress: () => console.log('ยกเลิก'), style: 'cancel' },
          { text: 'ใช่', onPress: () => BackHandler.exitApp() },
        ],
        { cancelable: true });
    }
    else
      this.setState({ Start_Scanner: false });
    return true;
  }

  openLink_in_browser = () => {
    Linking.openURL(this.state.QR_Code_Value);
  }

  onQR_Code_Scan_Done = (QR_Code) => {
    var qrdata, isJSON = '1';

    try {
      qrdata = JSON.parse(QR_Code);
    }
    catch{
      Alert.alert('ผิดพลาด', 'รูปแบบคิวอาร์โค้ดไม่ถูกต้อง โปรดตรวจสอบข้อมูลอีกครั้ง');
      isJSON = '0';
    }

    if (isJSON == '1') {
      qrdata.macAddr = mac_addr;

      fetch('https://www.trackmycars.net/bike/Api/V1/register_check/', {
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
                {
                  text: 'ยืนยัน', onPress: () => {
                    var bikedata_confirm = { user: bikedata.users_user, bikeId: bikedata.bike_id, macAddr: mac_addr };

                    fetch('https://www.trackmycars.net/bike/Api/V1/register_confirm/', {
                      method: 'POST',
                      headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify(bikedata_confirm),
                    })
                      .then((response) => response.json())
                      .then((responseData) => {
                        if (responseData.code == 'SUCCESS') {
                          this.saveBikeKeytoAsync(bikedata.users_user, bikedata.bike_id, mac_addr)
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
                { text: 'ยกเลิก', onPress: () => console.log('ยกเลิก'), style: 'cancel' },
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

        });
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

  saveBikeKeytoAsync = async (user, bikeId, mac_addr) => {
    try {
      await AsyncStorage.setItem('user_id', user)
      await AsyncStorage.setItem('bike_key', bikeId)
      await AsyncStorage.setItem('mac_address', mac_addr)
    } catch (e) {
      // save error
    }
  }

  set_Status_OnOff = async () => {
    let bike_key = await AsyncStorage.getItem('bike_key')
    let user_id = await AsyncStorage.getItem('user_id')
    let mac_address = await AsyncStorage.getItem('mac_address')
    Alert.alert(
      'ข้อมูล',
      `คีย์รถจักรยานยนต์คือ ${bike_key}
ที่อยู่แมคแอดเดรสคือ ${mac_address}
ไอดีของคุณคือ ${user_id}`,
    );
  }

  onBottomButtonPressed = () => {
    this.setState({ Start_Scanner: false });
  }

  render() {
    if (!this.state.Start_Scanner) {

      return (
        <View style={styles.MainContainer}>

          <Text style={{ fontSize: 22, textAlign: 'center' }}>ยินดีต้อนรับสู่ ลูกข่ายติดตามรถจักรยานยนต์ Track My Bikes</Text>

          {/* <Text style={styles.QR_text}>
            {this.state.QR_Code_Value ? `Scanned QR Code: ${this.state.QR_Code_Value}` : ''}
          </Text> */}

          {this.state.QR_Code_Value.includes("http") ?
            <TouchableOpacity
              onPress={this.openLink_in_browser}
              style={styles.button}>
              <Text style={{ color: '#FFF', fontSize: 14 }}>Open Link in default Browser</Text>
            </TouchableOpacity> : null
          }

          <TouchableOpacity
            onPress={this.open_QR_Code_Scanner}
            style={styles.button}>
            <Text style={{ color: '#FFF', fontSize: 14 }}>
              สแกนคิวอาร์โค้ด
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            disabled={true}
            onPress={this.set_Status_OnOff}
            style={styles.button}>
            <Text style={{ color: '#FFF', fontSize: 14 }}>
              ปรับค่าไจโรสโคป
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={this.set_Status_OnOff}
            style={styles.button}>
            <Text style={{ color: '#FFF', fontSize: 14 }}>
              เปิดการติดตาม
            </Text>
          </TouchableOpacity>

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
});