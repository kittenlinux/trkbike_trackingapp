import React, { Component } from 'react';
 
import { StyleSheet, View, Text, Platform, TouchableOpacity, Linking, PermissionsAndroid, Alert, ActivityIndicator, BackHandler } from 'react-native';
 
import { CameraKitCameraScreen, } from 'react-native-camera-kit';
 
export default class App extends Component {
  constructor() {
    super();
 
    this.state = {
      QR_Code_Value: '',
      Start_Scanner: false,
    };
  }

  componentDidMount() {
    this.backHandler = BackHandler.addEventListener('hardwareBackPress', this.handleBackPress);
  }

  componentWillUnmount() {
    this.backHandler.remove()
  }

  handleBackPress = () => {
    if(!this.state.Start_Scanner){
      Alert.alert(
        'ออกจากโปรแกรม',
        'คุณต้องการออกไปยังหน้าหลักหรือไม่ ?',
        [
          {text: 'ไม่ใช่', onPress: () => console.log('ยกเลิก'), style: 'cancel'},
          {text: 'ใช่', onPress: () => BackHandler.exitApp()},
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
    // Adding fetch code
    

    this.setState({ QR_Code_Value: QR_Code });
    this.setState({ Start_Scanner: false });
  }
 
  open_QR_Code_Scanner=()=> {
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
            Alert.alert("ผิดพลาด","การขอสิทธิ์เพื่อใช้งานกล้องถูกปฏิเสธ");
          }
        } catch (err) {
          Alert.alert("ผิดพลาด","พบปัญหาในการขอสิทธิ์เพื่อใช้งานกล้อง");
          console.warn(err);
        }
      }
      requestCameraPermission();
    } else {
      that.setState({ QR_Code_Value: '' });
      that.setState({ Start_Scanner: true });
    }
  }

  set_Status_OnOff=()=> {
    Alert.alert(
      'ตรวจสอบข้อมูล',
      'รูปแบบคิวอาร์โค้ดถูกต้อง ตรวจสอบข้อมูลจากเครื่องแม่ข่ายสำเร็จ !\n\nผู้ใช้งาน : null\nหมายเลขทะเบียน : null\n\nยี่ห้อ รุ่น : null\nสี : null\n\nยืนยันการผูกอุปกรณ์เข้ากับรถจักรยานยนต์ ?',
      [
        {text: 'ยืนยัน', onPress: () => console.log('ยืนยัน')},
        {text: 'ยกเลิก', onPress: () => console.log('ยกเลิก'), style: 'cancel'},
      ],
      { cancelable: false }
    );
  }

  onBottomButtonPressed=()=>{
    this.setState({ Start_Scanner: false });
  }

  render() {
    if (!this.state.Start_Scanner) {
 
      return (
        <View style={styles.MainContainer}>
 
          <Text style={{ fontSize: 22, textAlign: 'center' }}>ยินดีต้อนรับสู่ ลูกข่ายติดตามรถจักรยานยนต์ Track My Bikes</Text>
 
          <Text style={styles.QR_text}>
            {this.state.QR_Code_Value ? 'Scanned QR Code: ' + this.state.QR_Code_Value : ''}
          </Text>
 
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
        <Text>Test</Text>
 
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